import { createLocalJWKSet, exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
	authorizeUrl,
	billingUrl,
	clientAssertion,
	clientMetadataDocument,
	exchangeCode,
	icOauthConfig,
	IcOauthError,
	jwksDocument,
	readFlight,
	safeReturnPath,
	startFlight,
} from "./ic-oauth";

let pem: string;
beforeAll(async () => {
	const { privateKey } = await generateKeyPair("RS256", {
		modulusLength: 2048,
		extractable: true,
	});
	pem = await exportPKCS8(privateKey);
});

beforeEach(() => {
	process.env.SHEETS_OAUTH_PRIVATE_KEY = Buffer.from(pem).toString("base64");
	process.env.SHEETS_CREDENTIALS_KEY = "k".repeat(40);
	process.env.BETTER_AUTH_URL = "https://sheets.test";
});
afterEach(() => {
	delete process.env.SHEETS_OAUTH_PRIVATE_KEY;
	delete process.env.SHEETS_CREDENTIALS_KEY;
	delete process.env.BETTER_AUTH_URL;
	vi.restoreAllMocks();
});

function cfg() {
	const c = icOauthConfig();
	if (!c) throw new Error("not configured");
	return c;
}

describe("configuration", () => {
	it("is inert without a private key, so paste keeps working", () => {
		delete process.env.SHEETS_OAUTH_PRIVATE_KEY;
		expect(icOauthConfig()).toBeNull();
	});

	it("derives client_id, redirect and jwks URLs from the app origin", () => {
		const c = cfg();
		expect(c.clientId).toBe("https://sheets.test/oauth/client.json");
		expect(c.redirectUri).toBe(
			"https://sheets.test/internal/connect/ingram-cloud/callback",
		);
		expect(c.jwksUri).toBe("https://sheets.test/oauth/jwks.json");
		expect(c.apiBase).toBe("https://api.cloud.ingram.tech");
	});
});

describe("identity documents", () => {
	it("serves a metadata document IC will accept: client_id = its URL, private_key_jwt + jwks_uri", () => {
		const c = cfg();
		const doc = clientMetadataDocument(c);
		expect(doc.client_id).toBe(c.clientId);
		expect(doc.redirect_uris).toEqual([c.redirectUri]);
		expect(doc.token_endpoint_auth_method).toBe("private_key_jwt");
		expect(doc.jwks_uri).toBe(c.jwksUri);
		expect(doc).not.toHaveProperty("client_secret");
	});

	it("publishes the key that signs client assertions (kid = RFC 7638 thumbprint)", async () => {
		const c = cfg();
		const jwks = await jwksDocument(c);
		const assertion = await clientAssertion(c);
		// Verified exactly the way IC's token endpoint does.
		const { protectedHeader, payload } = await jwtVerify(
			assertion,
			createLocalJWKSet(jwks),
			{ issuer: c.clientId, subject: c.clientId, audience: c.apiBase },
		);
		expect(protectedHeader.kid).toBe(jwks.keys[0]?.kid);
		expect(payload.jti).toBeTruthy();
	});
});

describe("the in-flight cookie", () => {
	it("round-trips, binds the user and the return path, and is the OAuth state", () => {
		const c = cfg();
		const { flight, cookie } = startFlight(c, "user_1", "/w/wb_abc");
		expect(readFlight(c, cookie)).toEqual(flight);
		expect(flight.returnTo).toBe("/w/wb_abc");
		const u = new URL(authorizeUrl(c, flight));
		expect(u.searchParams.get("state")).toBe(flight.nonce);
		expect(u.searchParams.get("code_challenge_method")).toBe("S256");
		expect(u.searchParams.get("scope")).toBe("runs:read runs:write");
		expect(u.searchParams.has("resource")).toBe(false);
	});

	it("rejects a forged or foreign-secret cookie", () => {
		const c = cfg();
		const { cookie } = startFlight(c, "user_1", "/spreadsheets");
		expect(readFlight(c, `${cookie}x`)).toBeNull();
		expect(
			readFlight(
				c,
				cookie.replace(/^./, (ch) => (ch === "A" ? "B" : "A")),
			),
		).toBeNull();
		expect(readFlight({ ...c, stateSecret: "other" }, cookie)).toBeNull();
	});

	it("never returns to another origin", () => {
		expect(safeReturnPath("https://evil.test/")).toBe("/spreadsheets");
		expect(safeReturnPath("//evil.test/")).toBe("/spreadsheets");
		expect(safeReturnPath(null)).toBe("/spreadsheets");
		expect(safeReturnPath("/w/wb_x")).toBe("/w/wb_x");
	});
});

describe("code exchange", () => {
	it("posts a PKCE + private_key_jwt exchange and returns the project token", async () => {
		const c = cfg();
		const { flight } = startFlight(c, "user_1", "/spreadsheets");
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					access_token: "tha_live_x",
					token_type: "bearer",
					scope: "tenant:*",
				}),
				{ status: 200 },
			),
		);
		const out = await exchangeCode(c, flight, "code123");
		expect(out.token).toBe("tha_live_x");
		const [url, init] = fetchMock.mock.calls[0] ?? [];
		expect(url).toBe("https://api.cloud.ingram.tech/oauth/token");
		const form = new URLSearchParams(String(init?.body));
		expect(form.get("grant_type")).toBe("authorization_code");
		expect(form.get("code_verifier")).toBe(flight.verifier);
		expect(form.get("client_assertion_type")).toBe(
			"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		);
		expect(form.get("client_assertion")).toBeTruthy();
	});

	it("surfaces IC's error code", async () => {
		const c = cfg();
		const { flight } = startFlight(c, "user_1", "/spreadsheets");
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
		);
		await expect(exchangeCode(c, flight, "bad")).rejects.toMatchObject({
			name: "IcOauthError",
			code: "invalid_grant",
		});
		expect(new IcOauthError("x", "y").code).toBe("x");
	});
});

describe("billing", () => {
	it("sends the user to the console with our client_id and a same-origin return", () => {
		const u = new URL(billingUrl(cfg(), "/w/wb_x"));
		expect(u.origin).toBe("https://cloud.ingram.tech");
		expect(u.searchParams.get("client_id")).toBe(
			"https://sheets.test/oauth/client.json",
		);
		expect(u.searchParams.get("return_url")).toBe("https://sheets.test/w/wb_x");
	});
});

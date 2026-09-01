/**
 * Ingram Cloud app grants — "Link Ingram Cloud" in one click.
 *
 * IC's authorization server issues *project tokens* to apps (cloud.ingram.tech
 * #261): Sheets sends the user to `/oauth/authorize` with no `resource`, the
 * IC console signs them in (or up), lets them pick or create an organization
 * and consent, and `/oauth/token` hands back a `tha_live_…` token for a
 * project IC created in that org, named after Sheets. That token is exactly
 * what a pasted key is, so it lands in `saveInferenceCredential` unchanged.
 *
 * How Sheets identifies itself: a Client ID Metadata Document — `client_id` IS
 * the URL of `/oauth/client.json`, which lists our redirect URI and declares
 * `private_key_jwt` with a `jwks_uri`. So a stolen code is inert without the
 * key behind `/oauth/jwks.json`, and no secret is ever shared with IC.
 *
 * Inert until `SHEETS_OAUTH_PRIVATE_KEY` (an RSA PKCS8 PEM, base64 accepted)
 * is set; paste keeps working either way. The in-flight request (user, PKCE
 * verifier, nonce, where to return) rides an HMAC-signed, short-lived cookie
 * between `start` and `callback`, and `state` is the nonce — so a callback
 * can only complete the link the same browser started, for the user it
 * started it for. Same design as depot's `ic-oauth.ts`.
 */

import "server-only";

import {
	createHash,
	createHmac,
	createPublicKey,
	randomBytes,
	timingSafeEqual,
} from "node:crypto";
import {
	calculateJwkThumbprint,
	type CryptoKey,
	importPKCS8,
	type JWK,
	SignJWT,
} from "jose";
import { z } from "zod";

const IC_API_BASE_DEFAULT = "https://api.cloud.ingram.tech";
const IC_CONSOLE_URL_DEFAULT = "https://cloud.ingram.tech";
/** How long a started link stays redeemable. */
const FLIGHT_TTL_MS = 15 * 60 * 1000;
export const FLIGHT_COOKIE = "sheets_ic_link";
export const FLIGHT_COOKIE_PATH = "/internal/connect/ingram-cloud";
/** Where a finished link lands when the start request named nowhere. */
export const DEFAULT_RETURN_PATH = "/spreadsheets";

export type IcOauthConfig = {
	/** The AS base (no `/v1`): issuer, and where `/oauth/*` lives. Also the
	 *  API origin the minted token is used against. */
	apiBase: string;
	consoleUrl: string;
	clientId: string;
	redirectUri: string;
	jwksUri: string;
	privateKeyPem: string;
	/** HMAC secret for the in-flight cookie. */
	stateSecret: string;
};

/** The app's canonical origin, no trailing slash. */
export function appUrl(): string {
	return (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

function readPem(raw: string): string {
	const trimmed = raw.trim();
	if (trimmed.startsWith("-----BEGIN")) return trimmed.replace(/\\n/g, "\n");
	return Buffer.from(trimmed, "base64").toString("utf8");
}

/** Null when linking isn't configured on this deployment. */
export function icOauthConfig(): IcOauthConfig | null {
	const rawKey = process.env.SHEETS_OAUTH_PRIVATE_KEY;
	const stateSecret = process.env.SHEETS_CREDENTIALS_KEY;
	if (!rawKey || !stateSecret) return null;
	const apiBase = (process.env.INGRAM_CLOUD_API_BASE ?? IC_API_BASE_DEFAULT).replace(
		/\/+$/,
		"",
	);
	const origin = appUrl();
	return {
		apiBase,
		consoleUrl: (
			process.env.INGRAM_CLOUD_CONSOLE_URL ?? IC_CONSOLE_URL_DEFAULT
		).replace(/\/+$/, ""),
		clientId: `${origin}/oauth/client.json`,
		redirectUri: `${origin}${FLIGHT_COOKIE_PATH}/callback`,
		jwksUri: `${origin}/oauth/jwks.json`,
		privateKeyPem: readPem(rawKey),
		stateSecret,
	};
}

// ── Identity documents ──────────────────────────────────────────────────────

/** The Client ID Metadata Document IC fetches at `client_id`. */
export function clientMetadataDocument(cfg: IcOauthConfig) {
	return {
		client_id: cfg.clientId,
		client_name: "Ingram Sheets",
		client_uri: appUrl(),
		redirect_uris: [cfg.redirectUri],
		grant_types: ["authorization_code"],
		response_types: ["code"],
		token_endpoint_auth_method: "private_key_jwt",
		jwks_uri: cfg.jwksUri,
	};
}

/** The public half of the signing key as a JWK, with its RFC 7638 thumbprint
 *  as `kid` — the same `kid` every client assertion carries. */
export async function publicJwk(cfg: IcOauthConfig): Promise<JWK & { kid: string }> {
	const exported = createPublicKey(cfg.privateKeyPem).export({ format: "jwk" });
	const jwk = z
		.object({ kty: z.literal("RSA"), n: z.string(), e: z.string() })
		.parse(exported);
	const kid = await calculateJwkThumbprint(jwk);
	return { ...jwk, kid, alg: "RS256", use: "sig" };
}

export async function jwksDocument(cfg: IcOauthConfig) {
	return { keys: [await publicJwk(cfg)] };
}

// ── The dance ───────────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
	return buf.toString("base64url");
}

export type Flight = {
	userId: string;
	verifier: string;
	nonce: string;
	/** Same-origin path to land on after the link completes. */
	returnTo: string;
};

/** A path on this origin, or the default — never an open redirect. */
export function safeReturnPath(raw: string | null | undefined): string {
	if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
		return DEFAULT_RETURN_PATH;
	}
	return raw.length > 512 ? DEFAULT_RETURN_PATH : raw;
}

/** Mint a fresh in-flight record and its signed cookie value. */
export function startFlight(
	cfg: IcOauthConfig,
	userId: string,
	returnTo: string,
): { flight: Flight; cookie: string } {
	const flight: Flight = {
		userId,
		verifier: b64url(randomBytes(32)),
		nonce: b64url(randomBytes(16)),
		returnTo: safeReturnPath(returnTo),
	};
	const payload = b64url(
		Buffer.from(JSON.stringify({ ...flight, e: Date.now() + FLIGHT_TTL_MS })),
	);
	const sig = createHmac("sha256", `ic-link:${cfg.stateSecret}`)
		.update(payload)
		.digest("base64url");
	return { flight, cookie: `${payload}.${sig}` };
}

const flightShape = z.object({
	userId: z.string().min(1),
	verifier: z.string().min(32),
	nonce: z.string().min(8),
	returnTo: z.string().min(1),
	e: z.number(),
});

/** Recover the in-flight record from its cookie, or null if forged/expired. */
export function readFlight(cfg: IcOauthConfig, cookie: string): Flight | null {
	const [payload, sig] = cookie.split(".");
	if (!payload || !sig) return null;
	const expected = createHmac("sha256", `ic-link:${cfg.stateSecret}`)
		.update(payload)
		.digest("base64url");
	const a = Buffer.from(sig);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	let parsed: z.infer<typeof flightShape>;
	try {
		parsed = flightShape.parse(
			JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
		);
	} catch {
		return null;
	}
	if (parsed.e < Date.now()) return null;
	return {
		userId: parsed.userId,
		verifier: parsed.verifier,
		nonce: parsed.nonce,
		returnTo: safeReturnPath(parsed.returnTo),
	};
}

/**
 * The scopes Sheets asks for on an app grant.
 *
 * Not `tenant:*`. Agents, smiths and runs all gate on `runs:*` in the API, and
 * an app token carries no principal, so that is the whole of what we need —
 * asking for the tenant master key to run a spreadsheet agent would be a
 * grant we could never justify to the person granting it.
 */
const APP_SCOPES = ["runs:read", "runs:write"];

/** Where to send the browser: IC's authorize endpoint, asking for an app grant
 *  (no `resource`) scoped to what Sheets actually does. */
export function authorizeUrl(cfg: IcOauthConfig, flight: Flight): string {
	const u = new URL(`${cfg.apiBase}/oauth/authorize`);
	u.searchParams.set("response_type", "code");
	u.searchParams.set("client_id", cfg.clientId);
	u.searchParams.set("redirect_uri", cfg.redirectUri);
	u.searchParams.set("scope", APP_SCOPES.join(" "));
	u.searchParams.set(
		"code_challenge",
		createHash("sha256").update(flight.verifier).digest("base64url"),
	);
	u.searchParams.set("code_challenge_method", "S256");
	u.searchParams.set("state", flight.nonce);
	return u.toString();
}

async function signingKey(
	cfg: IcOauthConfig,
): Promise<{ key: CryptoKey; kid: string }> {
	const [key, jwk] = await Promise.all([
		importPKCS8(cfg.privateKeyPem, "RS256"),
		publicJwk(cfg),
	]);
	return { key, kid: jwk.kid };
}

/** RFC 7523 client assertion: iss = sub = our client_id, aud = the AS. */
export async function clientAssertion(cfg: IcOauthConfig): Promise<string> {
	const { key, kid } = await signingKey(cfg);
	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({ jti: b64url(randomBytes(16)) })
		.setProtectedHeader({ alg: "RS256", kid })
		.setIssuer(cfg.clientId)
		.setSubject(cfg.clientId)
		.setAudience(cfg.apiBase)
		.setIssuedAt(now)
		.setExpirationTime(now + 300)
		.sign(key);
}

const tokenOut = z.object({
	access_token: z.string().min(1),
	token_type: z.string(),
	scope: z.string().optional(),
});

export class IcOauthError extends Error {
	readonly code: string;
	constructor(code: string, message: string) {
		super(message);
		this.name = "IcOauthError";
		this.code = code;
	}
}

/** Redeem the code for the project token. */
export async function exchangeCode(
	cfg: IcOauthConfig,
	flight: Flight,
	code: string,
): Promise<{ token: string; scope: string }> {
	const form = new URLSearchParams({
		grant_type: "authorization_code",
		code,
		client_id: cfg.clientId,
		redirect_uri: cfg.redirectUri,
		code_verifier: flight.verifier,
		client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
		client_assertion: await clientAssertion(cfg),
	});
	const res = await fetch(`${cfg.apiBase}/oauth/token`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: form,
	});
	const text = await res.text();
	if (!res.ok) {
		const err = z
			.object({ error: z.string(), error_description: z.string().optional() })
			.safeParse(safeJson(text));
		throw new IcOauthError(
			err.success ? err.data.error : `http_${res.status}`,
			err.success
				? (err.data.error_description ?? err.data.error)
				: `IC replied ${res.status}`,
		);
	}
	const parsed = tokenOut.safeParse(safeJson(text));
	if (!parsed.success)
		throw new IcOauthError("bad_token_response", "Unexpected token response.");
	return { token: parsed.data.access_token, scope: parsed.data.scope ?? "" };
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** The console's billing page, told which app sent the user and where to come
 *  back to. `return_url` must live on our client_id's origin. */
export function billingUrl(
	cfg: IcOauthConfig,
	returnPath = DEFAULT_RETURN_PATH,
): string {
	const u = new URL(`${cfg.consoleUrl}/console/settings/billing`);
	u.searchParams.set("client_id", cfg.clientId);
	u.searchParams.set("return_url", `${appUrl()}${safeReturnPath(returnPath)}`);
	return u.toString();
}

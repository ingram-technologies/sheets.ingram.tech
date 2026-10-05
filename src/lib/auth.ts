import { authBasePath, authSecret, uuidGenerateId } from "@ingram-tech/nk-auth";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { jwt } from "better-auth/plugins";

import { pool } from "@/lib/db";
import { DRIVE_FILE_SCOPE } from "@/lib/gsheets-transfer";

/**
 * Google-only sign-in via the shared Ingram Google OAuth client (the same
 * client that backs ingram-cloud's console — its authorized redirect URIs
 * list includes https://sheets.ingram.tech/auth/callback/google).
 *
 * Sign-in asks only for the NON-sensitive `drive.file` scope (plus the
 * identity scopes). The sensitive `spreadsheets` scope is deliberately NOT
 * requested here: the shared OAuth client is unverified, and any sensitive
 * scope in the sign-in request puts Google's "hasn't verified this app"
 * interstitial in front of every new user. `drive.file` alone covers the
 * bridge for spreadsheets this app created or the user picked via the
 * Picker; opening a foreign sheet by URL is the one case that needs
 * `spreadsheets`, requested on demand via `requestSpreadsheetsAccess`
 * (`src/lib/google-access.ts`). The provider always sends
 * `include_granted_scopes`, so a later grant keeps earlier ones.
 * `accessType: "offline"` stores a refresh token in the `account` table for
 * the server-side Sheets API calls.
 */
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * Dynamic client registration defaults a client to `web`, as OpenID's DCR
 * spec says, and a web client may not redirect to plain-http localhost. But a
 * client that registers only `http://localhost:PORT/callback` is by
 * definition a native app on the user's machine (RFC 8252 §7.3) — which is
 * what every MCP CLI is, and most of them leave `application_type` out. Say
 * `native` for them, so the registration that was always going to be
 * accepted for a native app is accepted here.
 */
const registerLoopbackClientsAsNative = createAuthMiddleware(async (ctx) => {
	if (ctx.path !== "/oauth2/register") return;
	const body: unknown = ctx.body;
	if (typeof body !== "object" || body === null) return;
	if ("application_type" in body && body.application_type !== undefined) return;
	const uris = "redirect_uris" in body ? body.redirect_uris : undefined;
	if (!Array.isArray(uris) || uris.length === 0) return;
	const allLoopback = uris.every((uri: unknown) => {
		if (typeof uri !== "string") return false;
		try {
			const url = new URL(uri);
			return (
				url.protocol === "http:" &&
				["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
			);
		} catch {
			return false;
		}
	});
	if (!allLoopback) return;
	return { context: { body: { ...body, application_type: "native" } } };
});

/** The MCP endpoint, as the resource its access tokens are bound to. */
export const mcpResource = `${baseURL}/api/mcp`;

export const auth = betterAuth({
	database: pool,
	secret: authSecret(),
	baseURL,
	basePath: authBasePath,
	advanced: { database: { generateId: uuidGenerateId } },
	hooks: { before: registerLoopbackClientsAsNative },
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID ?? "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
			scope: [DRIVE_FILE_SCOPE],
			accessType: "offline",
		},
	},
	plugins: [
		// Signs the MCP access tokens, so /api/mcp verifies them against our
		// JWKS instead of a database lookup per call.
		jwt(),
		/**
		 * Makes this app an OAuth provider for MCP clients, so `claude mcp add`
		 * against /api/mcp completes with a browser sign-in and no API key.
		 *
		 * Deliberately not a personal-access-token table: an MCP client is a
		 * third-party program acting for the user, which is the case OAuth
		 * exists for. It also means revocation is per-client, and a leaked
		 * token is not a permanent key to the account.
		 *
		 * The consent page is where the user sees which program is asking
		 * before it gets their workbooks.
		 */
		mcp({
			loginPage: "/login",
			consentPage: "/consent",
			resource: mcpResource,
			// MCP has moved to Client ID Metadata Documents (below), but
			// clients written before that register themselves dynamically,
			// with no credential to register with.
			allowDynamicClientRegistration: true,
			allowUnauthenticatedClientRegistration: true,
		}),
		// A client names itself by the URL of a metadata document it hosts,
		// so there is nothing to register at all.
		cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
	],
});

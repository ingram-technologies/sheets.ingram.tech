import { authBasePath, authSecret, uuidGenerateId } from "@ingram-tech/nk-auth";
import { betterAuth } from "better-auth";
import { mcp } from "better-auth/plugins";

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
export const auth = betterAuth({
	database: pool,
	secret: authSecret(),
	baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
	basePath: authBasePath,
	advanced: { database: { generateId: uuidGenerateId } },
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID ?? "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
			scope: [DRIVE_FILE_SCOPE],
			accessType: "offline",
		},
	},
	plugins: [
		/**
		 * Makes this app an OAuth provider for MCP clients, so `claude mcp add`
		 * against /api/mcp completes with a browser sign-in and no API key.
		 *
		 * Deliberately not a personal-access-token table: an MCP client is a
		 * third-party program acting for the user, which is the case OAuth
		 * exists for. It also means revocation is per-client, and a leaked
		 * token is not a permanent key to the account. Claude Code registers
		 * itself dynamically, so there is nothing to configure per client.
		 */
		mcp({ loginPage: "/login" }),
	],
});

import { authBasePath, authSecret, uuidGenerateId } from "@ingram-tech/nk-auth";
import { betterAuth } from "better-auth";

import { pool } from "@/lib/db";
import { DRIVE_FILE_SCOPE, SPREADSHEETS_SCOPE } from "@/lib/gsheets-transfer";

/**
 * Google-only sign-in via the shared Ingram Google OAuth client (the same
 * client that backs ingram-cloud's console — its authorized redirect URIs
 * list includes https://sheets.ingram.tech/auth/callback/google).
 *
 * The Sheets scopes are requested at sign-in but OPTIONAL: Google's
 * granular-consent screen presents them as checkboxes the user can leave
 * unticked and still complete login (the Google Sheets bridge then prompts
 * for incremental consent when used). The provider always sends
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
			scope: [SPREADSHEETS_SCOPE, DRIVE_FILE_SCOPE],
			accessType: "offline",
		},
	},
});

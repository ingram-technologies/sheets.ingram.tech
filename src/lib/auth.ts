import { authBasePath, authSecret, uuidGenerateId } from "@ingram-tech/nk-auth";
import { betterAuth } from "better-auth";

import { pool } from "@/lib/db";

/**
 * Google-only sign-in via the shared Ingram Google OAuth client (the same
 * client that backs ingram-cloud's console — its authorized redirect URIs
 * list includes https://sheets.ingram.tech/auth/callback/google).
 *
 * The spreadsheets scope is requested at sign-in but OPTIONAL: Google's
 * granular-consent screen presents it as a checkbox the user can leave
 * unticked and still complete login. The provider always sends
 * `include_granted_scopes`, so a user who declines now can grant it on a
 * later sign-in without re-consenting to the basics. `accessType: "offline"`
 * stores a refresh token in the `account` table for future server-side
 * Sheets API import/export.
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
			scope: ["https://www.googleapis.com/auth/spreadsheets"],
			accessType: "offline",
		},
	},
});

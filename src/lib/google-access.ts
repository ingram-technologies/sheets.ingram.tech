"use client";

import { authClient } from "@/lib/auth-client";
import {
	DRIVE_FILE_SCOPE,
	GOOGLE_SCOPE_MISSING,
	SPREADSHEETS_SCOPE,
} from "@/lib/gsheets-transfer";

/** True when an API error body is the "grant Google Sheets access" signal. */
export function isScopeMissing(body: unknown): boolean {
	return (
		typeof body === "object" &&
		body !== null &&
		"error" in body &&
		body.error === GOOGLE_SCOPE_MISSING
	);
}

/**
 * Copy shown before sending the user to on-demand `spreadsheets` consent.
 * That scope is sensitive and the shared OAuth client is unverified, so
 * Google shows a "hasn't verified this app" page first — warn about it here
 * so the interstitial reads as expected rather than alarming.
 */
export const SPREADSHEETS_ACCESS_EXPLAINER =
	"This spreadsheet wasn't created or picked through Sheets, so Google needs a separate permission for it. Google will show a \"hasn't verified this app\" warning — choose Advanced, then Continue.";

/**
 * Send the user through Google's incremental-consent flow for the sensitive
 * `spreadsheets` scope (never requested at sign-in — see `src/lib/auth.ts`),
 * plus `drive.file` in case that was declined too. Navigates away; on return
 * they land on `callbackPath`.
 */
export async function requestSpreadsheetsAccess(callbackPath: string): Promise<void> {
	await authClient.linkSocial({
		provider: "google",
		scopes: [SPREADSHEETS_SCOPE, DRIVE_FILE_SCOPE],
		callbackURL: callbackPath,
	});
}

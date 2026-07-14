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
 * Send the user through Google's incremental-consent flow for the Sheets
 * scopes (they declined the optional checkboxes at sign-in, or granted only
 * one of the pair). Navigates away; on return they land on `callbackPath`.
 */
export async function requestSpreadsheetsAccess(callbackPath: string): Promise<void> {
	await authClient.linkSocial({
		provider: "google",
		scopes: [SPREADSHEETS_SCOPE, DRIVE_FILE_SCOPE],
		callbackURL: callbackPath,
	});
}

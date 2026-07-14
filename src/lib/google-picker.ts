"use client";

import { z } from "zod";

/**
 * Thin loader around the Google Picker — Google's own Drive-browse UI. It
 * runs entirely client-side against the user's access token under the
 * non-sensitive `drive.file` scope: the user browses ALL their sheets in
 * Google's iframe, and picking one grants this app access to just that file.
 *
 * Configured via NEXT_PUBLIC_GOOGLE_PICKER_API_KEY (an API key from the same
 * Cloud project as the OAuth client) and NEXT_PUBLIC_GOOGLE_PICKER_APP_ID
 * (that project's number). Both ship in the bundle by design — the API key
 * is referrer-restricted, the project number is public.
 */

export function pickerConfig(): { apiKey: string; appId: string } | null {
	const apiKey = process.env.NEXT_PUBLIC_GOOGLE_PICKER_API_KEY;
	const appId = process.env.NEXT_PUBLIC_GOOGLE_PICKER_APP_ID;
	return apiKey && appId ? { apiKey, appId } : null;
}

// Minimal surface of the Picker namespace we drive; the loader below is the
// only place that touches the untyped globals.
type PickerNamespace = {
	PickerBuilder: new () => PickerBuilder;
	ViewId: { SPREADSHEETS: unknown };
	Action: { PICKED: string; CANCEL: string };
};
type PickerBuilder = {
	addView(view: unknown): PickerBuilder;
	setOAuthToken(token: string): PickerBuilder;
	setDeveloperKey(key: string): PickerBuilder;
	setAppId(appId: string): PickerBuilder;
	setTitle(title: string): PickerBuilder;
	setCallback(callback: (data: unknown) => void): PickerBuilder;
	build(): { setVisible(visible: boolean): void; dispose(): void };
};

declare global {
	interface Window {
		gapi?: { load(name: string, callback: () => void): void };
		google?: { picker?: PickerNamespace };
	}
}

let pickerReady: Promise<PickerNamespace> | null = null;

function loadPicker(): Promise<PickerNamespace> {
	pickerReady ??= new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = "https://apis.google.com/js/api.js";
		script.async = true;
		script.onerror = () => {
			pickerReady = null;
			reject(new Error("Failed to load the Google Picker script"));
		};
		script.onload = () => {
			if (!window.gapi) {
				reject(new Error("Google API script loaded without gapi"));
				return;
			}
			window.gapi.load("picker", () => {
				const picker = window.google?.picker;
				if (picker) resolve(picker);
				else reject(new Error("Google Picker failed to initialize"));
			});
		};
		document.head.appendChild(script);
	});
	return pickerReady;
}

const pickedSchema = z.object({
	action: z.string(),
	docs: z.array(z.object({ id: z.string() }).loose()).optional(),
});

/**
 * Open the Picker over the user's spreadsheets; resolves with the picked
 * spreadsheet id, or null when the user cancels.
 */
export async function pickSpreadsheet(
	config: { apiKey: string; appId: string },
	accessToken: string,
): Promise<string | null> {
	const ns = await loadPicker();
	return new Promise((resolve) => {
		const picker = new ns.PickerBuilder()
			.addView(ns.ViewId.SPREADSHEETS)
			.setOAuthToken(accessToken)
			.setDeveloperKey(config.apiKey)
			.setAppId(config.appId)
			.setTitle("Open from Google Sheets")
			.setCallback((data: unknown) => {
				const parsed = pickedSchema.safeParse(data);
				if (!parsed.success) return;
				if (parsed.data.action === ns.Action.PICKED) {
					picker.dispose();
					resolve(parsed.data.docs?.[0]?.id ?? null);
				} else if (parsed.data.action === ns.Action.CANCEL) {
					picker.dispose();
					resolve(null);
				}
			})
			.build();
		picker.setVisible(true);
	});
}

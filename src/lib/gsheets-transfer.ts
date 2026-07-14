import { z } from "zod";

/**
 * The neutral workbook snapshot exchanged between the browser (which owns the
 * engine) and the server (which owns the Google OAuth token). Deliberately
 * value-level only — cell inputs, formulas, and number formats (so dates
 * survive the round-trip) — richer styling can ride along later.
 *
 * Zod-validated on the server: the snapshot arrives as an external request
 * body, and Google's grid data is an external response.
 */

export const SPREADSHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

/**
 * Per-file Drive access (non-sensitive scope): lets the app list/search the
 * spreadsheets it created or that the user picked via the Google Picker —
 * NOT all of Drive. Full Drive listing scopes are restricted (heavy Google
 * verification for the shared OAuth client), so browse-all goes through the
 * Picker instead.
 */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** Error code the client turns into a "grant Google Sheets access" prompt. */
export const GOOGLE_SCOPE_MISSING = "google_scope_missing";

// Bounds sized to the engine's own limits (used-range scans cap at 256
// columns) and to keep a snapshot an unremarkable JSON body.
export const MAX_SNAPSHOT_CELLS = 150_000;
const MAX_ROW = 1_048_576;
const MAX_COLUMN = 512;

const cellSchema = z.object({
	/** 1-based row. */
	r: z.number().int().min(1).max(MAX_ROW),
	/** 1-based column. */
	c: z.number().int().min(1).max(MAX_COLUMN),
	/** Formula, including the leading `=`. Mutually exclusive with `v`. */
	f: z.string().max(8192).optional(),
	/** Literal value, typed so text like "123" survives as text. */
	v: z.union([z.string().max(50_000), z.number(), z.boolean()]).optional(),
	/** Number-format pattern (e.g. `#,##0.00`, `yyyy-mm-dd`). */
	nf: z.string().max(200).optional(),
});

const sheetSchema = z.object({
	name: z.string().min(1).max(100),
	cells: z.array(cellSchema),
});

export const snapshotSchema = z
	.object({ sheets: z.array(sheetSchema).min(1).max(100) })
	.refine(
		(snapshot) =>
			snapshot.sheets.reduce((n, sheet) => n + sheet.cells.length, 0) <=
			MAX_SNAPSHOT_CELLS,
		{ message: `snapshot exceeds ${MAX_SNAPSHOT_CELLS} cells` },
	);

export type SnapshotCell = z.infer<typeof cellSchema>;
export type SnapshotSheet = z.infer<typeof sheetSchema>;
export type WorkbookSnapshot = z.infer<typeof snapshotSchema>;

const SPREADSHEET_ID_PATTERN = /^[a-zA-Z0-9_-]{20,120}$/;

/**
 * Accepts a full Google Sheets URL or a bare spreadsheet id and returns the
 * id, or null when neither shape matches.
 */
export function parseSpreadsheetRef(ref: string): string | null {
	const trimmed = ref.trim();
	const fromUrl = /\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/.exec(trimmed);
	if (fromUrl?.[1]) return fromUrl[1];
	return SPREADSHEET_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function spreadsheetUrl(spreadsheetId: string): string {
	return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
}

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { auth } from "@/lib/auth";
import {
	GOOGLE_SCOPE_MISSING,
	MAX_SNAPSHOT_CELLS,
	SPREADSHEETS_SCOPE,
	type SnapshotCell,
	type WorkbookSnapshot,
} from "@/lib/gsheets-transfer";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";

/**
 * Server half of the Google Sheets bridge. The browser owns the engine and
 * sends/receives neutral snapshots (`gsheets-transfer.ts`); this module owns
 * the OAuth token (via Better Auth's account store) and the Sheets v4 calls.
 *
 * Saving is a FULL REPLACE of the target spreadsheet — sheets.ingram.tech is
 * the source of truth for a linked workbook (1:1 mapping), so gsheet-side
 * edits and extra sheets are overwritten on every save.
 */

const API = "https://sheets.googleapis.com/v4/spreadsheets";

export type GsheetsFailure =
	| { kind: "no_scope" }
	| { kind: "no_account" }
	| { kind: "not_found" }
	| { kind: "too_large" }
	| { kind: "google_error"; message: string };

export class GsheetsError extends Error {
	readonly failure: GsheetsFailure;
	constructor(failure: GsheetsFailure) {
		super(failure.kind === "google_error" ? failure.message : failure.kind);
		this.failure = failure;
	}
}

/** Map a bridge failure to the HTTP response the panel/dialog understands. */
export function gsheetsErrorResponse(error: unknown): Response {
	if (error instanceof GsheetsError) {
		switch (error.failure.kind) {
			case "no_scope":
			case "no_account":
				return Response.json({ error: GOOGLE_SCOPE_MISSING }, { status: 403 });
			case "not_found":
				return Response.json(
					{ error: "Spreadsheet not found (or no access to it)." },
					{ status: 404 },
				);
			case "too_large":
				return Response.json(
					{ error: "That spreadsheet is too large to import." },
					{ status: 413 },
				);
			case "google_error":
				return Response.json(
					{ error: `Google Sheets: ${error.failure.message}` },
					{ status: 502 },
				);
		}
	}
	throw error;
}

/**
 * Access token for the user's Google account, refreshed by Better Auth.
 * Throws `no_scope` unless every scope in `required` was granted.
 */
export async function getGoogleToken(
	userId: string,
	required: string[] = [SPREADSHEETS_SCOPE],
): Promise<{ accessToken: string; scopes: string[] }> {
	let accessToken: string;
	let scopes: string[];
	try {
		({ accessToken, scopes } = await auth.api.getAccessToken({
			body: { providerId: "google", userId },
		}));
	} catch {
		throw new GsheetsError({ kind: "no_account" });
	}
	if (!required.every((scope) => scopes.includes(scope))) {
		throw new GsheetsError({ kind: "no_scope" });
	}
	return { accessToken, scopes };
}

async function googleFetch(
	token: string,
	url: string,
	init?: RequestInit,
): Promise<unknown> {
	const response = await fetch(url, {
		...init,
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			...init?.headers,
		},
	});
	if (response.ok) return response.json();
	if (response.status === 404) throw new GsheetsError({ kind: "not_found" });
	const body = await response.text();
	const parsed = googleErrorSchema.safeParse(safeJson(body));
	const message = parsed.success ? parsed.data.error.message : body.slice(0, 300);
	// Tokens minted before the user granted the Sheets checkbox come back 403
	// ACCESS_TOKEN_SCOPE_INSUFFICIENT even though the scope row says granted.
	if (response.status === 401 || /scope|insufficient/i.test(message)) {
		throw new GsheetsError({ kind: "no_scope" });
	}
	throw new GsheetsError({ kind: "google_error", message });
}

function safeJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

const googleErrorSchema = z.object({
	error: z.object({ message: z.string() }).loose(),
});

// ── Export (save to Google Sheets) ──────────────────────────────────────────

export async function exportToGoogle(
	token: string,
	snapshot: WorkbookSnapshot,
	options: { title: string; spreadsheetId: string | null },
): Promise<{ spreadsheetId: string }> {
	if (options.spreadsheetId) {
		try {
			await replaceSpreadsheet(token, options.spreadsheetId, snapshot);
			return { spreadsheetId: options.spreadsheetId };
		} catch (error) {
			// The linked spreadsheet was deleted on the Google side: fall
			// through and mint a fresh one (the caller re-links).
			if (
				!(error instanceof GsheetsError) ||
				error.failure.kind !== "not_found"
			) {
				throw error;
			}
		}
	}
	return createSpreadsheet(token, options.title, snapshot);
}

const createResponseSchema = z.object({ spreadsheetId: z.string() });

async function createSpreadsheet(
	token: string,
	title: string,
	snapshot: WorkbookSnapshot,
): Promise<{ spreadsheetId: string }> {
	const created = await googleFetch(token, API, {
		method: "POST",
		body: JSON.stringify({
			properties: { title },
			sheets: snapshot.sheets.map((sheet, index) => ({
				properties: {
					sheetId: index,
					index,
					title: sheet.name,
					gridProperties: gridSize(sheet.cells),
				},
			})),
		}),
	});
	const { spreadsheetId } = createResponseSchema.parse(created);
	await googleFetch(token, `${API}/${spreadsheetId}:batchUpdate`, {
		method: "POST",
		body: JSON.stringify({
			requests: snapshot.sheets.map((sheet, index) =>
				updateCellsRequest(index, sheet.cells),
			),
		}),
	});
	return { spreadsheetId };
}

const sheetListSchema = z.object({
	sheets: z.array(
		z.object({ properties: z.object({ sheetId: z.number() }).loose() }),
	),
});

/**
 * Full replace in one batchUpdate: add the new sheets under temp titles
 * (fresh sheetIds chosen client-side so later requests in the same batch can
 * reference them), delete every old sheet, rename into place, write cells.
 * Rebuilding sheets outright sidesteps title-collision ordering entirely.
 */
async function replaceSpreadsheet(
	token: string,
	spreadsheetId: string,
	snapshot: WorkbookSnapshot,
): Promise<void> {
	const meta = await googleFetch(
		token,
		`${API}/${spreadsheetId}?fields=sheets.properties.sheetId`,
	);
	const existing = sheetListSchema
		.parse(meta)
		.sheets.map((sheet) => sheet.properties.sheetId);
	const firstFreeId = Math.max(-1, ...existing) + 1;
	const tempSuffix = randomUUID().slice(0, 8);

	const requests: unknown[] = [
		...snapshot.sheets.map((sheet, index) => ({
			addSheet: {
				properties: {
					sheetId: firstFreeId + index,
					index,
					title: `__nk_${tempSuffix}_${index}`,
					gridProperties: gridSize(sheet.cells),
				},
			},
		})),
		...existing.map((sheetId) => ({ deleteSheet: { sheetId } })),
		...snapshot.sheets.map((sheet, index) => ({
			updateSheetProperties: {
				properties: { sheetId: firstFreeId + index, title: sheet.name },
				fields: "title",
			},
		})),
		...snapshot.sheets.map((sheet, index) =>
			updateCellsRequest(firstFreeId + index, sheet.cells),
		),
	];
	await googleFetch(token, `${API}/${spreadsheetId}:batchUpdate`, {
		method: "POST",
		body: JSON.stringify({ requests }),
	});
}

function gridSize(cells: SnapshotCell[]): { rowCount: number; columnCount: number } {
	let rows = 0;
	let cols = 0;
	for (const cell of cells) {
		if (cell.r > rows) rows = cell.r;
		if (cell.c > cols) cols = cell.c;
	}
	return { rowCount: Math.max(rows + 10, 100), columnCount: Math.max(cols + 2, 26) };
}

type GoogleCellData = {
	userEnteredValue?: Record<string, unknown>;
	userEnteredFormat?: { numberFormat: { type: string; pattern: string } };
};

/**
 * One updateCells over the sheet's whole grid: cells beyond the provided rows
 * are cleared for the listed fields, which is exactly full-replace semantics.
 */
function updateCellsRequest(sheetId: number, cells: SnapshotCell[]): unknown {
	const size = gridSize(cells);
	const rows: { values: GoogleCellData[] }[] = Array.from(
		{ length: size.rowCount },
		() => ({ values: [] }),
	);
	for (const cell of cells) {
		const row = rows[cell.r - 1];
		if (!row) continue;
		while (row.values.length < cell.c) row.values.push({});
		row.values[cell.c - 1] = toCellData(cell);
	}
	return {
		updateCells: {
			range: { sheetId },
			fields: "userEnteredValue,userEnteredFormat.numberFormat",
			rows,
		},
	};
}

function toCellData(cell: SnapshotCell): GoogleCellData {
	const data: GoogleCellData = {};
	if (cell.f !== undefined) {
		data.userEnteredValue = { formulaValue: cell.f };
	} else if (typeof cell.v === "number") {
		data.userEnteredValue = { numberValue: cell.v };
	} else if (typeof cell.v === "boolean") {
		data.userEnteredValue = { boolValue: cell.v };
	} else if (typeof cell.v === "string") {
		data.userEnteredValue = { stringValue: cell.v };
	}
	if (cell.nf) {
		data.userEnteredFormat = {
			numberFormat: { type: numberFormatType(cell.nf), pattern: cell.nf },
		};
	}
	return data;
}

/** Google requires a NumberFormatType alongside the pattern; infer one. */
function numberFormatType(pattern: string): string {
	const p = pattern.toLowerCase();
	const date = /d|y{2,}|mmm/.test(p);
	const time = /h|am\/pm|:s/.test(p);
	if (date && time) return "DATE_TIME";
	if (date) return "DATE";
	if (time) return "TIME";
	if (p.includes("%")) return "PERCENT";
	if (/[$€£¥]/.test(p)) return "CURRENCY";
	return "NUMBER";
}

// ── Search (drive.file listing) ─────────────────────────────────────────────

const driveListSchema = z.object({
	files: z.array(
		z
			.object({
				id: z.string(),
				name: z.string(),
				modifiedTime: z.string().optional(),
			})
			.loose(),
	),
});

export type SpreadsheetListing = {
	id: string;
	name: string;
	modifiedTime: string | null;
};

/**
 * Spreadsheets visible under the `drive.file` grant: ones this app created
 * plus ones the user picked via the Google Picker. Empty `query` returns the
 * most recently modified.
 */
export async function searchSpreadsheets(
	token: string,
	query: string,
): Promise<SpreadsheetListing[]> {
	const terms = [
		"mimeType='application/vnd.google-apps.spreadsheet'",
		"trashed=false",
	];
	const trimmed = query.trim();
	if (trimmed) {
		terms.push(
			`name contains '${trimmed.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`,
		);
	}
	const params = new URLSearchParams({
		q: terms.join(" and "),
		orderBy: "modifiedTime desc",
		pageSize: "20",
		fields: "files(id,name,modifiedTime)",
	});
	const raw = await googleFetch(token, `${DRIVE_API}?${params}`);
	return driveListSchema.parse(raw).files.map((file) => ({
		id: file.id,
		name: file.name,
		modifiedTime: file.modifiedTime ?? null,
	}));
}

// ── Import (open from Google Sheets) ────────────────────────────────────────

const gridResponseSchema = z.object({
	properties: z.object({ title: z.string() }).loose(),
	sheets: z.array(
		z.object({
			properties: z.object({ title: z.string() }).loose(),
			data: z
				.array(
					z.object({
						startRow: z.number().optional(),
						startColumn: z.number().optional(),
						rowData: z
							.array(
								z
									.object({
										values: z
											.array(
												z
													.object({
														userEnteredValue: z
															.object({
																formulaValue: z
																	.string()
																	.optional(),
																numberValue: z
																	.number()
																	.optional(),
																stringValue: z
																	.string()
																	.optional(),
																boolValue: z
																	.boolean()
																	.optional(),
															})
															.loose()
															.optional(),
														userEnteredFormat: z
															.object({
																numberFormat: z
																	.object({
																		pattern: z
																			.string()
																			.optional(),
																	})
																	.loose()
																	.optional(),
															})
															.loose()
															.optional(),
													})
													.loose(),
											)
											.optional(),
									})
									.loose(),
							)
							.optional(),
					}),
				)
				.optional(),
		}),
	),
});

export async function importFromGoogle(
	token: string,
	spreadsheetId: string,
): Promise<{ title: string; snapshot: WorkbookSnapshot }> {
	const fields =
		"properties.title," +
		"sheets.properties.title," +
		"sheets.data(startRow,startColumn," +
		"rowData.values(userEnteredValue,userEnteredFormat.numberFormat.pattern))";
	const raw = await googleFetch(
		token,
		`${API}/${spreadsheetId}?includeGridData=true&fields=${encodeURIComponent(fields)}`,
	);
	const parsed = gridResponseSchema.parse(raw);

	let total = 0;
	const sheets = parsed.sheets.map((sheet) => {
		const cells: SnapshotCell[] = [];
		for (const block of sheet.data ?? []) {
			const rowOffset = block.startRow ?? 0;
			const colOffset = block.startColumn ?? 0;
			(block.rowData ?? []).forEach((rowData, r) => {
				(rowData.values ?? []).forEach((value, c) => {
					const entered = value.userEnteredValue;
					const pattern = value.userEnteredFormat?.numberFormat?.pattern;
					const cell: SnapshotCell = {
						r: rowOffset + r + 1,
						c: colOffset + c + 1,
					};
					if (entered?.formulaValue !== undefined)
						cell.f = entered.formulaValue;
					else if (entered?.numberValue !== undefined)
						cell.v = entered.numberValue;
					else if (entered?.boolValue !== undefined)
						cell.v = entered.boolValue;
					else if (entered?.stringValue !== undefined)
						cell.v = entered.stringValue;
					if (pattern && pattern !== "General") cell.nf = pattern;
					if (cell.f === undefined && cell.v === undefined && !cell.nf)
						return;
					cells.push(cell);
					total += 1;
				});
			});
		}
		return { name: sheet.properties.title, cells };
	});
	if (total > MAX_SNAPSHOT_CELLS) throw new GsheetsError({ kind: "too_large" });
	return { title: parsed.properties.title, snapshot: { sheets } };
}

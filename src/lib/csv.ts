import type { WorkbookSnapshot } from "@/lib/gsheets-transfer";
import { MAX_SNAPSHOT_CELLS } from "@/lib/gsheets-transfer";

/**
 * Client-side CSV parsing for import. RFC 4180 plus the quirks real files
 * have: CRLF and bare-CR line endings, quoted fields with embedded newlines
 * and doubled quotes, a UTF-8 BOM, and ; or tab as the delimiter (sniffed
 * from the first line). Values stay raw strings — the engine's own input
 * parser decides what's a number, boolean, date, or formula, exactly as if
 * the user had typed each cell.
 */

export type Delimiter = "," | ";" | "\t";

/**
 * Pick the delimiter by counting candidates outside quotes on the first
 * line. Ties go to the comma.
 */
export function detectDelimiter(text: string): Delimiter {
	const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
	let inQuotes = false;
	for (const char of text) {
		if (char === '"') inQuotes = !inQuotes;
		else if (!inQuotes) {
			if (char === "\n" || char === "\r") break;
			if (char === "," || char === ";" || char === "\t") counts[char]++;
		}
	}
	let best: Delimiter = ",";
	for (const candidate of [";", "\t"] as const) {
		if (counts[candidate] > counts[best]) best = candidate;
	}
	return best;
}

export function parseCsv(input: string, delimiter?: Delimiter): string[][] {
	const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
	const sep = delimiter ?? detectDelimiter(text);
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	const endField = () => {
		row.push(field);
		field = "";
	};
	const endRow = () => {
		endField();
		rows.push(row);
		row = [];
	};

	for (let i = 0; i < text.length; i++) {
		const char = text[i];
		if (inQuotes) {
			if (char === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
		} else if (char === '"' && field === "") {
			inQuotes = true;
		} else if (char === sep) {
			endField();
		} else if (char === "\n") {
			endRow();
		} else if (char === "\r") {
			endRow();
			if (text[i + 1] === "\n") i++;
		} else {
			field += char;
		}
	}
	// Final field, unless the file ended cleanly on a newline.
	if (field !== "" || row.length > 0) endRow();
	return rows;
}

/**
 * Rows → the neutral snapshot `modelFromSnapshot` consumes. Values ride as
 * strings so the engine parses them like typed input (formulas included).
 * Returns null when the file holds more non-empty cells than a snapshot —
 * and the engine's serializer — are sized for.
 */
export function csvToSnapshot(
	sheetName: string,
	rows: string[][],
): WorkbookSnapshot | null {
	const cells: WorkbookSnapshot["sheets"][number]["cells"] = [];
	for (let r = 0; r < rows.length; r++) {
		const cols = rows[r] ?? [];
		for (let c = 0; c < cols.length; c++) {
			const value = (cols[c] ?? "").trim();
			if (value === "") continue;
			if (cells.length >= MAX_SNAPSHOT_CELLS) return null;
			cells.push({ r: r + 1, c: c + 1, v: value });
		}
	}
	return { sheets: [{ name: sheetName || "Sheet1", cells }] };
}

/** "revenue-2026.csv" → "revenue-2026"; empty/dotfile names fall back. */
export function fileStem(fileName: string): string {
	const stem = fileName.replace(/\.[^.]+$/, "").trim();
	return stem || "Imported CSV";
}

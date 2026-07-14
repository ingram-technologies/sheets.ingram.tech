/**
 * A1-notation helpers. Rows and columns are 1-based, matching the IronCalc
 * wasm API. A `CellRange` is always normalized (start ≤ end).
 */

export interface CellRef {
	row: number;
	col: number;
}

export interface CellRange {
	startRow: number;
	startCol: number;
	endRow: number;
	endCol: number;
}

export const MAX_COLUMN = 16384;
export const MAX_ROW = 1048576;

export function columnToLetters(col: number): string {
	let letters = "";
	let n = col;
	while (n > 0) {
		const rem = (n - 1) % 26;
		letters = String.fromCharCode(65 + rem) + letters;
		n = Math.floor((n - 1) / 26);
	}
	return letters;
}

export function lettersToColumn(letters: string): number {
	let col = 0;
	for (const ch of letters.toUpperCase()) {
		col = col * 26 + (ch.charCodeAt(0) - 64);
	}
	return col;
}

export function formatCell(ref: CellRef): string {
	return `${columnToLetters(ref.col)}${ref.row}`;
}

export function formatRange(range: CellRange): string {
	const start = formatCell({ row: range.startRow, col: range.startCol });
	if (range.startRow === range.endRow && range.startCol === range.endCol)
		return start;
	return `${start}:${formatCell({ row: range.endRow, col: range.endCol })}`;
}

const CELL_RE = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/;

export function parseCell(text: string): CellRef | null {
	const match = CELL_RE.exec(text.trim());
	if (!match?.[1] || !match[2]) return null;
	const col = lettersToColumn(match[1]);
	const row = Number.parseInt(match[2], 10);
	if (row < 1 || row > MAX_ROW || col < 1 || col > MAX_COLUMN) return null;
	return { row, col };
}

/** Parse "B2", "A1:C10" (either corner order) — no sheet qualifier. */
export function parseRange(text: string): CellRange | null {
	const parts = text.split(":");
	if (parts.length === 1 && parts[0]) {
		const cell = parseCell(parts[0]);
		if (!cell) return null;
		return {
			startRow: cell.row,
			startCol: cell.col,
			endRow: cell.row,
			endCol: cell.col,
		};
	}
	if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
	const a = parseCell(parts[0]);
	const b = parseCell(parts[1]);
	if (!a || !b) return null;
	return {
		startRow: Math.min(a.row, b.row),
		startCol: Math.min(a.col, b.col),
		endRow: Math.max(a.row, b.row),
		endCol: Math.max(a.col, b.col),
	};
}

export function rangeWidth(range: CellRange): number {
	return range.endCol - range.startCol + 1;
}

export function rangeHeight(range: CellRange): number {
	return range.endRow - range.startRow + 1;
}

export function cellCount(range: CellRange): number {
	return rangeWidth(range) * rangeHeight(range);
}

export function rangeContains(range: CellRange, row: number, col: number): boolean {
	return (
		row >= range.startRow &&
		row <= range.endRow &&
		col >= range.startCol &&
		col <= range.endCol
	);
}

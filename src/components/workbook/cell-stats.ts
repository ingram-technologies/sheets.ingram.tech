import { CellType } from "./controller";

/**
 * Selection stats (Sum/Avg/Count) without inventing numbers.
 *
 * The engine exposes no numeric accessor — only `getCellContent` (the raw
 * input, or the formula source for a formula cell) and `getFormattedCellValue`
 * (a display string shaped by the cell's number format). See
 * docs/engine-constraints.md. Everything here works around that, and the rule
 * is: when a cell's value cannot be recovered exactly, it is skipped, never
 * guessed.
 *
 * The previous implementation regex-stripped the *formatted* string
 * (`value.replace(/[^0-9.eE+-]/g, "")`), which silently fabricated values:
 * "(1234)" is TEXT to this engine but scanned as 1234, and "€1.000,12" — also
 * text — collapsed to 1.00012 and was added to the sum.
 */

/** What the source of truth is for a given cell, per `probe`-verified behaviour. */
export interface CellReader {
	cellType(sheet: number, row: number, col: number): CellType;
	cellContent(sheet: number, row: number, col: number): string;
	formattedValue(sheet: number, row: number, col: number): string;
}

export interface SelectionStats {
	sum: number;
	/** Cells that contributed to `sum` — the Avg denominator. */
	numeric: number;
	/** Non-empty cells, numeric or not. */
	filled: number;
	/** Numeric cells whose value could not be recovered exactly (e.g. dates). */
	skipped: number;
	/** Smallest and largest contributing value; null when none contributed. */
	min: number | null;
	max: number | null;
}

/**
 * The engine is constructed with locale "en" (see Workbook/FileManager), so any
 * string it formats uses "," for grouping and "." for the decimal point. This
 * parser is therefore only ever applied to engine output, never user input.
 */
export function parseEngineNumber(formatted: string): number | null {
	let text = formatted.trim();
	if (text === "") return null;

	// Engine error values (#DIV/0!, #VALUE!, #REF!, #N/A …). This guard is not
	// redundant: stripping non-numeric characters from "#DIV/0!" leaves "0",
	// which would otherwise parse as a perfectly plausible zero.
	if (text.startsWith("#")) return null;

	// Accounting number formats render negatives as "(1,234.50)".
	let negative = false;
	if (text.startsWith("(") && text.endsWith(")")) {
		negative = true;
		text = text.slice(1, -1);
	}

	// Strip currency symbols, grouping commas, percent signs and whitespace —
	// but nothing that carries magnitude.
	const percent = text.includes("%");
	const cleaned = text.replace(/[^0-9.eE+-]/g, "");

	// Require a well-formed number rather than "whatever Number() tolerates":
	// the strip can concatenate unrelated digits out of a stray string.
	if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(cleaned)) return null;

	const value = Number(cleaned);
	if (!Number.isFinite(value)) return null;
	const signed = negative ? -value : value;
	return percent ? signed / 100 : signed;
}

/**
 * Recover a cell's numeric value, or null when it isn't a number we can trust.
 *
 * Literals are read from `cellContent`, which the engine stores canonically —
 * "$1,234.50" is kept as "1234.5" and "15%" as "0.15", so no parsing guesswork
 * is involved. Formula cells only expose their result as a formatted string, so
 * those go through `parseEngineNumber`.
 *
 * Dates are type Number but their content is "2026-07-15", which is not a
 * parseable quantity — they return null (a date is not something to sum).
 */
export function numericValue(
	reader: CellReader,
	sheet: number,
	row: number,
	col: number,
): number | null {
	if (reader.cellType(sheet, row, col) !== CellType.Number) return null;

	const content = reader.cellContent(sheet, row, col);
	if (content === "") return null;

	if (!content.startsWith("=")) {
		const literal = Number(content);
		return Number.isFinite(literal) ? literal : null;
	}
	return parseEngineNumber(reader.formattedValue(sheet, row, col));
}

export function selectionStats(
	reader: CellReader,
	sheet: number,
	range: { startRow: number; startCol: number; endRow: number; endCol: number },
): SelectionStats {
	let sum = 0;
	let numeric = 0;
	let filled = 0;
	let skipped = 0;
	let min: number | null = null;
	let max: number | null = null;

	for (let row = range.startRow; row <= range.endRow; row++) {
		for (let col = range.startCol; col <= range.endCol; col++) {
			if (reader.formattedValue(sheet, row, col) === "") continue;
			filled += 1;
			const value = numericValue(reader, sheet, row, col);
			if (value === null) {
				if (reader.cellType(sheet, row, col) === CellType.Number) skipped += 1;
				continue;
			}
			sum += value;
			numeric += 1;
			// Seeded from the first contributor rather than ±Infinity, so a
			// selection with no numbers reports null instead of Infinity.
			if (min === null || value < min) min = value;
			if (max === null || value > max) max = value;
		}
	}
	return { sum, numeric, filled, skipped, min, max };
}

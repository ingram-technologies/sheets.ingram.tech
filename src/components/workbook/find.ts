import type { CellRef } from "@/lib/a1";

/**
 * Find & replace over a sheet.
 *
 * The grid is a canvas, so the browser's own Ctrl+F searches an empty DOM and
 * finds nothing — a spreadsheet has to bring its own. This module is the pure
 * half: it takes a cell reader and answers "which cells match", so the panel
 * stays presentational and the behaviour is testable without a wasm model.
 *
 * The values/formulas split matters and is not cosmetic. A cell holding
 * `=B2*1.2` *displays* `1,440.00`; searching the display finds it by its
 * result, searching the source finds it by its formula, and those are
 * different questions. Replace only ever rewrites the source — see
 * `replaceTargets`.
 */

export interface FindOptions {
	matchCase: boolean;
	/** The whole cell must equal the query, not merely contain it. */
	wholeCell: boolean;
	/** Search the formula source instead of the displayed value. */
	inFormulas: boolean;
}

export const DEFAULT_FIND_OPTIONS: FindOptions = {
	matchCase: false,
	wholeCell: false,
	inFormulas: false,
};

export interface FindReader {
	filledCells(sheet: number): CellRef[];
	cellContent(sheet: number, row: number, col: number): string;
	formattedValue(sheet: number, row: number, col: number): string;
}

function hit(haystack: string, needle: string, options: FindOptions): boolean {
	if (needle === "") return false;
	const a = options.matchCase ? haystack : haystack.toLowerCase();
	const b = options.matchCase ? needle : needle.toLowerCase();
	return options.wholeCell ? a === b : a.includes(b);
}

/** Matching cells in row-major order — the order Find Next walks. */
export function findMatches(
	reader: FindReader,
	sheet: number,
	query: string,
	options: FindOptions,
): CellRef[] {
	if (query.trim() === "") return [];
	return reader.filledCells(sheet).filter((ref) => {
		const text = options.inFormulas
			? reader.cellContent(sheet, ref.row, ref.col)
			: reader.formattedValue(sheet, ref.row, ref.col);
		return hit(text, query, options);
	});
}

/**
 * Index of the first match at or after `from`, wrapping to 0. -1 when there
 * are none. `direction` of -1 walks backwards, wrapping to the end.
 */
export function nextMatch(
	matches: CellRef[],
	from: CellRef,
	direction: 1 | -1,
): number {
	if (matches.length === 0) return -1;
	const after = (ref: CellRef) =>
		ref.row > from.row || (ref.row === from.row && ref.col > from.col);
	if (direction === 1) {
		const index = matches.findIndex(after);
		return index === -1 ? 0 : index;
	}
	for (let index = matches.length - 1; index >= 0; index--) {
		const ref = matches[index];
		if (ref && !after(ref) && !(ref.row === from.row && ref.col === from.col)) {
			return index;
		}
	}
	return matches.length - 1;
}

export interface ReplacePlan {
	/** Cells whose source contains the query, with the rewritten source. */
	edits: { ref: CellRef; next: string }[];
	/**
	 * Matches found by their displayed value whose source does not contain the
	 * query — a formula result, or a number the cell format reshaped. Rewriting
	 * the source would destroy the formula, so these are reported, not touched.
	 */
	skipped: number;
}

/**
 * What a replace would do, decided before anything is written.
 *
 * Replace always rewrites the *source*, never the displayed value: a cell
 * showing `1,440.00` from `=B2*1.2` has no "1,440.00" to replace, and blindly
 * writing the substituted display string over it would silently turn a formula
 * into a literal. Cells like that are counted into `skipped` so the panel can
 * say what it left alone instead of quietly under-replacing.
 */
export function replaceTargets(
	reader: FindReader,
	sheet: number,
	matches: CellRef[],
	query: string,
	replacement: string,
	options: FindOptions,
): ReplacePlan {
	const edits: ReplacePlan["edits"] = [];
	let skipped = 0;
	for (const ref of matches) {
		const source = reader.cellContent(sheet, ref.row, ref.col);
		if (!hit(source, query, options)) {
			skipped += 1;
			continue;
		}
		edits.push({ ref, next: substitute(source, query, replacement, options) });
	}
	return { edits, skipped };
}

/** Replace every occurrence, case-insensitively when asked, without regex. */
function substitute(
	source: string,
	query: string,
	replacement: string,
	options: FindOptions,
): string {
	if (options.wholeCell) return replacement;
	const haystack = options.matchCase ? source : source.toLowerCase();
	const needle = options.matchCase ? query : query.toLowerCase();
	let out = "";
	let cursor = 0;
	for (;;) {
		const at = haystack.indexOf(needle, cursor);
		if (at === -1) break;
		out += source.slice(cursor, at) + replacement;
		cursor = at + needle.length;
	}
	return out + source.slice(cursor);
}

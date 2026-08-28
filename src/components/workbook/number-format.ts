/**
 * Number-format surgery for the toolbar's one-click controls.
 *
 * The engine takes and returns an Excel format string (`style.num_fmt`), so
 * "one more decimal" is a string edit, not a numeric setting. Everything here
 * is pure and total: a format this module cannot read is reported as such
 * (`null`) rather than rewritten into a guess, because a wrong `num_fmt`
 * silently changes what every cell in the range *says* its value is.
 *
 * Two constructs make naive string editing wrong, and both are handled:
 *
 * - `[$€-x-euro2]` — a locale/currency section. Its digits and its `.` are not
 *   placeholders, so a scan that ignores brackets edits the currency tag.
 * - `"..."` and `\x` — literal text. `0.00" kg"` has a decimal run *and* a
 *   quoted string; the run is the first one, not the last.
 *
 * Sections (`positive;negative;zero;text`) are edited independently, so
 * `#,##0.00;(#,##0.00)` keeps both halves in step.
 */

/** What the engine calls "no explicit format". Compared case-insensitively. */
const GENERAL = "general";

/**
 * The format an untyped number falls back to when General gains decimals.
 * Excel's own Increase Decimal does this: General → `0.0`, not `#,##0.0`.
 */
const GENERAL_BASE = "0";

/** Excel tops out at 30; this is a toolbar, and past ~10 the cell is noise. */
const MAX_DECIMALS = 10;

/** True for `0`, `#` and `?` — the digit placeholders that can follow a point. */
function isPlaceholder(char: string): boolean {
	return char === "0" || char === "#" || char === "?";
}

/**
 * Split a format into its `;` sections, ignoring separators inside brackets,
 * quotes, or escaped by a backslash.
 */
function splitSections(format: string): string[] {
	const sections: string[] = [];
	let start = 0;
	let quoted = false;
	let bracketed = false;
	for (let index = 0; index < format.length; index++) {
		const char = format[index];
		if (char === "\\") {
			index += 1;
			continue;
		}
		if (char === '"') {
			quoted = !quoted;
			continue;
		}
		if (quoted) continue;
		if (char === "[") bracketed = true;
		else if (char === "]") bracketed = false;
		else if (char === ";" && !bracketed) {
			sections.push(format.slice(start, index));
			start = index + 1;
		}
	}
	sections.push(format.slice(start));
	return sections;
}

interface Decimals {
	/** Index of the `.` that separates integer from fraction. */
	point: number;
	/** Length of the placeholder run following it. */
	length: number;
}

/**
 * Locate the fraction run in a single section, or null when the section holds
 * no digit placeholder at all (a pure date/time or text format).
 */
function findDecimals(section: string): Decimals | null {
	let quoted = false;
	let bracketed = false;
	let sawPlaceholder = false;
	let point = -1;
	for (let index = 0; index < section.length; index++) {
		const char = section[index];
		if (char === "\\") {
			index += 1;
			continue;
		}
		if (char === '"') {
			quoted = !quoted;
			continue;
		}
		if (quoted) continue;
		if (char === "[") {
			bracketed = true;
			continue;
		}
		if (char === "]") {
			bracketed = false;
			continue;
		}
		if (bracketed) continue;
		if (char && isPlaceholder(char)) {
			sawPlaceholder = true;
			continue;
		}
		// The first unescaped, unquoted point that has a placeholder on one
		// side of it. `hh:mm` never reaches here; `0.00" kg"` stops at the
		// right one because the quoted tail is skipped above.
		if (char === "." && point === -1) {
			const next = section[index + 1];
			if (sawPlaceholder || (next !== undefined && isPlaceholder(next))) {
				point = index;
			}
		}
	}
	if (!sawPlaceholder) return null;
	if (point === -1) return { point: -1, length: 0 };
	let length = 0;
	while (isPlaceholder(section[point + 1 + length] ?? "")) length += 1;
	return { point, length };
}

/**
 * How many decimal places this format shows, or null when the question does
 * not apply — a date, a time, or a format with no digit placeholder. Callers
 * use the null to disable the control rather than to pick a default.
 */
export function decimalPlaces(format: string): number | null {
	if (format.trim() === "" || format.trim().toLowerCase() === GENERAL) return 0;
	const sections = splitSections(format);
	for (const section of sections) {
		const found = findDecimals(section);
		if (found) return found.length;
	}
	return null;
}

/** Rewrite one section to carry exactly `count` decimals. */
function setSectionDecimals(section: string, count: number): string {
	const found = findDecimals(section);
	if (!found) return section;
	const fraction = count > 0 ? `.${"0".repeat(count)}` : "";
	if (found.point === -1) {
		// No point yet: append the run after the last placeholder, so
		// `$#,##0` becomes `$#,##0.0` rather than `$#,##0.0` misplaced past a
		// trailing literal like `" kg"`.
		let last = -1;
		let quoted = false;
		let bracketed = false;
		for (let index = 0; index < section.length; index++) {
			const char = section[index];
			if (char === "\\") {
				index += 1;
				continue;
			}
			if (char === '"') {
				quoted = !quoted;
				continue;
			}
			if (quoted) continue;
			if (char === "[") bracketed = true;
			else if (char === "]") bracketed = false;
			else if (!bracketed && char && isPlaceholder(char)) last = index;
		}
		if (last === -1) return section;
		return section.slice(0, last + 1) + fraction + section.slice(last + 1);
	}
	return (
		section.slice(0, found.point) +
		fraction +
		section.slice(found.point + 1 + found.length)
	);
}

/**
 * The same format with `count` decimal places, clamped to 0…10.
 *
 * Returns null when the format carries no numeric placeholder — a date or a
 * time has no decimals to step, and inventing one would relabel the cell.
 */
export function withDecimals(format: string, count: number): string | null {
	const clamped = Math.max(0, Math.min(MAX_DECIMALS, count));
	const trimmed = format.trim();
	if (trimmed === "" || trimmed.toLowerCase() === GENERAL) {
		return setSectionDecimals(GENERAL_BASE, clamped);
	}
	if (decimalPlaces(format) === null) return null;
	return splitSections(format)
		.map((section) => setSectionDecimals(section, clamped))
		.join(";");
}

/** Step the decimal count by `delta`, or null when the format has none. */
export function stepDecimals(format: string, delta: number): string | null {
	const current = decimalPlaces(format);
	if (current === null) return null;
	return withDecimals(format, current + delta);
}

/** The format string the percent toggle applies when switching on. */
export const PERCENT_FORMAT = "0.00%";

/**
 * Whether this format renders a percentage — a `%` that is a real format
 * character, not one quoted or bracketed into a literal.
 */
export function isPercent(format: string): boolean {
	let quoted = false;
	let bracketed = false;
	for (let index = 0; index < format.length; index++) {
		const char = format[index];
		if (char === "\\") {
			index += 1;
			continue;
		}
		if (char === '"') {
			quoted = !quoted;
			continue;
		}
		if (quoted) continue;
		if (char === "[") bracketed = true;
		else if (char === "]") bracketed = false;
		else if (char === "%" && !bracketed) return true;
	}
	return false;
}

/**
 * Percent on, or back off.
 *
 * On is exactly the `Percent` entry the format menu already offers, so the
 * button and the menu row are one setting seen twice rather than two
 * near-identical formats. Off returns to General — the only honest inverse,
 * since the format the cell carried before is recorded nowhere.
 */
export function togglePercent(format: string): string {
	return isPercent(format) ? GENERAL : PERCENT_FORMAT;
}

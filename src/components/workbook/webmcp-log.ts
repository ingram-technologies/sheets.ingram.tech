/**
 * What the browser's agent just did, as a running list.
 *
 * The scratch workbook has no chat transcript to read — the conversation lives
 * in the agent's own window, off to the side of this tab. So the only place a
 * person can see what was done to their sheet is here. It doubles as the honest
 * account of the tool contract: each entry carries the result the tool actually
 * returned, delta echo included, rather than a paraphrase of it.
 */

export interface WebMcpCall {
	id: number;
	name: string;
	/** The arguments, compacted to one line for a narrow panel. */
	args: string;
	/** The tool's own first line — `ok — 11 cell(s) changed`, or an error. */
	result: string;
	/** Changed-cell count, when the result reported one. */
	changed: number | null;
}

const CHANGED = /^ok — (\d+) cell\(s\) changed/;

export function summarize(
	name: string,
	input: unknown,
	result: string,
): Omit<WebMcpCall, "id"> {
	const [first = ""] = result.split("\n");
	const match = CHANGED.exec(first);
	return {
		name,
		args: argsLine(input),
		result: first,
		changed: match?.[1] ? Number(match[1]) : null,
	};
}

/** A1 ranges and sheet names are what a reader recognises; a rectangular block
 *  of cell inputs is not, so it becomes its shape. */
function argsLine(input: unknown): string {
	if (typeof input !== "object" || input === null) return "";
	const parts: string[] = [];
	for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
		if (Array.isArray(value)) {
			const rows = value.length;
			const cols = Array.isArray(value[0]) ? value[0].length : 1;
			parts.push(`${key}: ${rows}×${cols}`);
			continue;
		}
		if (typeof value === "object") continue;
		parts.push(`${key}: ${String(value)}`);
	}
	return parts.join(" · ");
}

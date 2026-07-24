import { z } from "zod";

/**
 * The last thing an MCP client did to a workbook.
 *
 * This exists so the browser can *show* remote edits rather than have the grid
 * silently change under the user: the tab polls, sees the version move, and
 * renders what happened and who did it. That visibility is the product (see
 * docs/architecture.md), and without a realtime channel yet this record is how
 * it reaches the client.
 *
 * Deliberately a single "latest" value on the workbook row rather than an
 * append-only journal: it answers "what just happened?" in one read with no
 * join and no unbounded growth. sheetd's exec journal is the real version of
 * this — durable, sequenced, replayable — and will replace it.
 *
 * Shared by server and client, so this module must stay free of database and
 * Node imports.
 */
export const workbookActivitySchema = z.object({
	/** Who acted. Free text from the MCP client, e.g. "claude-code". */
	author: z.string(),
	/** The command script that ran, verbatim. */
	script: z.string(),
	/** sheetkit's rendered outcome, including the delta echo. Capped. */
	output: z.string(),
	/** The workbook version this produced — the client's "have I seen it?" key. */
	version: z.number(),
	at: z.iso.datetime(),
});

export type WorkbookActivity = z.infer<typeof workbookActivitySchema>;

/** Keep the stored record small; the echo can run long on a big fill. */
export const MAX_OUTPUT_CHARS = 4000;

export function truncateOutput(output: string): string {
	return output.length <= MAX_OUTPUT_CHARS
		? output
		: `${output.slice(0, MAX_OUTPUT_CHARS)}\n… (truncated)`;
}

/** Cap on cells pulsed from one activity — a 10k-row fill must not try to
 *  animate 10k cells. */
const MAX_PULSED_CELLS = 200;

/**
 * Best-effort extraction of changed cell references from a delta echo, for
 * highlighting them in the grid.
 *
 * Decoration, not data: the echo is a human-readable rendering that elides
 * long change lists, so this finds *some* of what changed, never provably all
 * of it. Nothing downstream may treat the result as complete — the authoritative
 * statement of what changed is the echo text itself, which is shown to the user
 * verbatim. Returns an empty array rather than throwing if the format shifts.
 */
export function changedCellsFromOutput(output: string): string[] {
	const refs: string[] = [];
	const seen = new Set<string>();
	// Matches the echo's `D2 ⇒ 14` form; the arrow is what distinguishes a
	// changed cell from an A1 reference merely mentioned in a command line.
	const pattern = /\b([A-Z]{1,3}\d{1,7})\s*⇒/gu;
	for (const match of output.matchAll(pattern)) {
		const ref = match[1];
		if (!ref || seen.has(ref)) continue;
		seen.add(ref);
		refs.push(ref);
		if (refs.length >= MAX_PULSED_CELLS) break;
	}
	return refs;
}

import { z } from "zod";

import { truncateOutput } from "@/lib/activity";
import { withCsvSession, withNewSession, withSession } from "@/lib/sheetkit-server";
import {
	createWorkbook,
	getWorkbookForEdit,
	listWorkbooks,
	saveWorkbookBytes,
} from "@/lib/workbooks";

/**
 * The MCP tool surface over a stored workbook.
 *
 * Shaped after sheetkit's own five-tool MCP server, with one difference that
 * drives the rest: workbooks here are *hosted and shared with a browser tab*,
 * not local files. So there is no open/save/close lifecycle to manage — every
 * call loads the current bytes, acts, and persists. An agent cannot leave a
 * workbook dirty, and cannot hold a stale session across calls.
 *
 * The verbs live inside `sheet_exec`'s command language rather than in the
 * tool list, which is what keeps the surface small enough for a model to hold
 * entirely in view. `sheet_exec` with the single line `help` returns the
 * grammar.
 *
 * Every tool is owner-scoped by the caller's user id: a workbook belonging to
 * someone else is reported missing, exactly as the REST routes do.
 */

const workbookId = z.string().describe("Workbook id from sheet_list, e.g. 'wb_3ZfQ…'.");

export const toolSchemas = {
	sheet_list: z.object({}),
	sheet_open: z.object({ workbook_id: workbookId }),
	sheet_view: z.object({
		workbook_id: workbookId,
		target: z
			.string()
			.describe(
				"What to render: an A1 range ('Sheet2!B3:D40'), a region name from the sketch ('table1'), a defined name, or a sheet name.",
			),
		mode: z
			.enum(["dense", "agg", "sparse", "auto"])
			.default("auto")
			.describe(
				"dense shows formulas and computed values together; agg summarises per column; auto picks by size.",
			),
		budget_tokens: z
			.number()
			.int()
			.min(100)
			.max(20000)
			.default(2000)
			.describe("Token budget for the rendering. Elision is always announced."),
	}),
	sheet_exec: z.object({
		workbook_id: workbookId,
		script: z
			.string()
			.describe(
				"Command script, one command per line, run top to bottom; a failing line stops the script and reports what did apply. Batch related commands into ONE call. Run the single line 'help' for the full grammar.",
			),
	}),
	sheet_create: z.object({
		name: z.string().min(1).max(200),
		csv: z
			.string()
			.optional()
			.describe("Optional CSV to seed the first sheet with."),
	}),
} as const;

export type ToolName = keyof typeof toolSchemas;

/** What the caller is labelled as in the activity record the UI shows. */
const AUTHOR = "claude-code";

export const toolDescriptions: Record<ToolName, string> = {
	sheet_list:
		"List your workbooks on sheets.ingram.tech. Start here to find the workbook id every other tool needs.",
	sheet_open:
		"Open a workbook and return its sketch: every sheet, detected table regions, per-column types, value ranges and fill formulas. This is a compressed structural overview, not a cell dump — a 10,000-row sheet describes itself in a few hundred tokens. Usually enough to act on directly, without viewing anything.",
	sheet_view:
		"Render part of a workbook under a token budget. Use only when the sketch left something genuinely ambiguous — small ranges come back as a dense grid showing formulas and computed values together.",
	sheet_exec:
		"Run a command script against a workbook and persist the result. Returns the recalc delta echo: exactly which cells changed, old to new, including formula ripple — so you never need to re-read a range to learn what your own edit did. Changes save immediately and appear live in any open browser tab.",
	sheet_create:
		"Create a new workbook, optionally seeded from CSV text. Returns its id and sketch.",
};

export type ToolResult = { text: string; isError?: boolean };

function notFound(id: string): ToolResult {
	return {
		text: `No workbook ${id}. Use sheet_list to see the workbooks on this account.`,
		isError: true,
	};
}

/**
 * Execute a tool for `userId`.
 *
 * Arguments arrive already validated against `toolSchemas` by the caller, so
 * these bodies deal only in well-formed input.
 */
export async function runTool(
	name: ToolName,
	args: unknown,
	userId: string,
): Promise<ToolResult> {
	switch (name) {
		case "sheet_list": {
			const workbooks = await listWorkbooks(userId);
			if (workbooks.length === 0) {
				return {
					text: "No workbooks yet. sheet_create makes one.",
				};
			}
			const lines = workbooks.map(
				(w) => `${w.id}  ${w.name}  (${w.size} bytes, updated ${w.updatedAt})`,
			);
			return { text: lines.join("\n") };
		}

		case "sheet_open": {
			const { workbook_id } = toolSchemas.sheet_open.parse(args);
			const found = await getWorkbookForEdit(workbook_id, userId);
			if (!found) return notFound(workbook_id);
			const sketch = await withSession(found.bytes, (s) => s.sketch());
			return { text: `${found.meta.name} (${found.meta.id})\n\n${sketch}` };
		}

		case "sheet_view": {
			const { workbook_id, target, mode, budget_tokens } =
				toolSchemas.sheet_view.parse(args);
			const found = await getWorkbookForEdit(workbook_id, userId);
			if (!found) return notFound(workbook_id);
			try {
				const rendered = await withSession(found.bytes, (s) =>
					// sheetkit takes an empty string, not a keyword, for "pick
					// the encoding yourself".
					s.view(target, mode === "auto" ? "" : mode, budget_tokens),
				);
				return { text: rendered };
			} catch (error) {
				return { text: engineError(error), isError: true };
			}
		}

		case "sheet_exec": {
			const { workbook_id, script } = toolSchemas.sheet_exec.parse(args);
			const found = await getWorkbookForEdit(workbook_id, userId);
			if (!found) return notFound(workbook_id);

			let output: string;
			let bytes: Uint8Array;
			try {
				const result = await withSession(found.bytes, (s) => ({
					output: s.exec(script, AUTHOR),
					bytes: s.toBytes(),
				}));
				output = result.output;
				bytes = result.bytes;
			} catch (error) {
				// A failing command is a normal outcome the agent should see and
				// correct, not a transport error. The workbook is untouched:
				// nothing was written.
				return { text: engineError(error), isError: true };
			}

			// A script that fails partway leaves the *session* half-applied —
			// sheetkit runs top to bottom and stops at the first bad line,
			// reporting what did apply. In the REPL that is exactly right. Here
			// it is not: this workbook may be open in a browser tab, and
			// persisting half an edit shows the user a mangled intermediate
			// state they never asked for and cannot easily undo. So a failed
			// script writes nothing at all — the agent gets the full echo,
			// including which line failed and what did apply in the discarded
			// attempt, and can send a corrected script against a clean workbook.
			if (scriptFailed(output)) {
				return {
					text: `${output}\n\nNothing was saved — the workbook is unchanged. Fix the failing line and send the whole script again.`,
					isError: true,
				};
			}

			const saved = await saveWorkbookBytes(
				workbook_id,
				userId,
				bytes,
				found.meta.version,
				{
					author: AUTHOR,
					script,
					output: truncateOutput(output),
					at: new Date().toISOString(),
				},
			);
			if (!saved.ok && saved.reason === "not_found") return notFound(workbook_id);
			if (!saved.ok) {
				// Someone edited in the browser between our read and write.
				// Replaying the script against the new state could double-apply
				// it, so say so and let the agent re-read and decide.
				return {
					text: `Not saved: this workbook changed while the script ran (now at version ${saved.meta.version}, read at ${found.meta.version}). Nothing was written. Run sheet_open to see the current state, then reapply what is still needed.`,
					isError: true,
				};
			}
			return { text: output };
		}

		case "sheet_create": {
			const { name: workbookName, csv } = toolSchemas.sheet_create.parse(args);
			let bytes: Uint8Array;
			let sketch: string;
			try {
				const build = (s: { toBytes(): Uint8Array; sketch(): string }) => ({
					bytes: s.toBytes(),
					sketch: s.sketch(),
				});
				const built = csv
					? await withCsvSession(csv, workbookName, build)
					: await withNewSession(workbookName, build);
				bytes = built.bytes;
				sketch = built.sketch;
			} catch (error) {
				return { text: engineError(error), isError: true };
			}
			const meta = await createWorkbook({ userId, name: workbookName, bytes });
			return { text: `Created ${meta.name} (${meta.id})\n\n${sketch}` };
		}
	}
}

/**
 * Did a command script stop on a bad line?
 *
 * sheetkit reports this in its rendered output rather than by throwing — a
 * failing `expect` or an unresolvable region is a normal result, not an
 * exception — so detecting it means reading the marker it prints. That is a
 * coupling to a rendering format, and worth naming: if the marker ever
 * changes, this returns false and a partially-applied script gets persisted,
 * which is sheetkit's own REPL behaviour. Degraded, not dangerous.
 */
function scriptFailed(output: string): boolean {
	return /^✗ line \d+/m.test(output);
}

/**
 * Surface the engine's own message. sheetkit reports a bad command precisely
 * ("no such region 'table2'", "expect F2 > 24000: FAILED (actual 19.5)"), and
 * that text is exactly what an agent needs to fix its next attempt — flattening
 * it into "invalid request" would throw away the useful half.
 */
function engineError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

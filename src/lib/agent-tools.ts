import { z } from "zod";

/**
 * The agent's tool surface over the in-browser workbook. Definitions are
 * shared by the chat API route (schema only — execution happens client-side
 * against the wasm engine) and the client executor. Cell addressing is A1;
 * sheets are addressed by name.
 *
 * Every mutating tool answers with a *delta echo*: the list of cells whose
 * computed value changed, including recalc ripple — so the agent never needs
 * to re-read a range to know the workbook's state.
 */

const sheetName = z
	.string()
	.describe("Sheet name, e.g. 'Sheet1'. Use get_workbook_overview to list sheets.");

const rangeRef = z
	.string()
	.describe("A1-style range on the sheet, e.g. 'B2' or 'A1:D20'.");

export const agentToolSchemas = {
	get_workbook_overview: z.object({}),
	read_range: z.object({
		sheet: sheetName,
		range: rangeRef,
	}),
	set_cells: z.object({
		sheet: sheetName,
		start_cell: z
			.string()
			.describe("Top-left cell where the block of values is written, e.g. 'B2'."),
		rows: z
			.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
			.describe(
				"Rectangular block of cell inputs, row by row. Strings are entered exactly as a user would type them (formulas start with '='); bare numbers and booleans are fine as-is. Use null (or '') to leave a cell untouched.",
			),
	}),
	fill_range: z.object({
		sheet: sheetName,
		source_range: rangeRef.describe(
			"Range holding the pattern to extend, e.g. 'D2' or 'A2:D2'.",
		),
		target_range: rangeRef.describe(
			"Full target range including the source, extended downward or rightward, e.g. 'D2:D100'. Formulas are displaced like a spreadsheet fill drag; number series are continued.",
		),
	}),
	clear_range: z.object({
		sheet: sheetName,
		range: rangeRef,
		what: z.enum(["contents", "formats", "all"]).default("contents"),
	}),
	format_range: z.object({
		sheet: sheetName,
		range: rangeRef,
		bold: z.boolean().optional(),
		italic: z.boolean().optional(),
		underline: z.boolean().optional(),
		text_color: z.string().optional().describe("Hex color like '#b91c1c'."),
		fill_color: z.string().optional().describe("Hex background color."),
		horizontal_align: z.enum(["left", "center", "right", "general"]).optional(),
		number_format: z
			.string()
			.optional()
			.describe(
				"Excel-style format code: 'general', '#,##0.00', '0.00%', '€#,##0.00', 'yyyy-mm-dd'.",
			),
	}),
	modify_structure: z.object({
		sheet: sheetName,
		operation: z.enum([
			"insert_rows",
			"delete_rows",
			"insert_columns",
			"delete_columns",
		]),
		index: z
			.number()
			.int()
			.min(1)
			.describe(
				"1-based row number or column number where the operation applies.",
			),
		count: z.number().int().min(1).max(1000).default(1),
	}),
	add_sheet: z.object({
		name: z.string().optional().describe("Optional name for the new sheet."),
	}),
	rename_sheet: z.object({
		sheet: sheetName,
		new_name: z.string(),
	}),
	undo: z.object({}),
	highlight_cells: z.object({
		sheet: sheetName,
		range: rangeRef,
		note: z
			.string()
			.describe(
				"Short note shown to the user next to the highlighted range — use this to point at cells and ask/flag something.",
			),
	}),
} as const;

export type AgentToolName = keyof typeof agentToolSchemas;

export type AgentToolInput<Name extends AgentToolName> = z.infer<
	(typeof agentToolSchemas)[Name]
>;

export const AGENT_TOOL_DESCRIPTIONS: Record<AgentToolName, string> = {
	get_workbook_overview:
		"Structure sketch of the whole workbook: sheets, used ranges, headers, and cell contents of small sheets. Call this first.",
	read_range:
		"Read a range: formatted values plus formulas. Prefer reading targeted ranges over whole sheets.",
	set_cells:
		"Write a rectangular block of cell inputs starting at start_cell. Returns the recalc delta (every cell whose computed value changed).",
	fill_range:
		"Extend a pattern across a range like dragging the fill handle — formulas displace, series continue. Returns the recalc delta.",
	clear_range: "Clear contents and/or formatting of a range.",
	format_range:
		"Apply formatting (font, colors, alignment, number format) to a range.",
	modify_structure: "Insert or delete whole rows or columns.",
	add_sheet: "Add a new sheet to the workbook.",
	rename_sheet: "Rename a sheet.",
	undo: "Undo the last change made to the workbook.",
	highlight_cells:
		"Visually highlight a range for the user with a note — the shared pointing finger. Use it to flag anomalies or ask about specific cells.",
};

import type { CellRange } from "@/lib/a1";
import {
	cellCount,
	columnToLetters,
	formatRange,
	parseCell,
	parseRange,
} from "@/lib/a1";
import type { AgentToolInput, AgentToolName } from "@/lib/agent-tools";
import { agentToolSchemas } from "@/lib/agent-tools";

import type { CellChange, MutationResult, WorkbookController } from "./controller";

/**
 * Executes the agent's tool calls against the in-browser engine, with
 * presence choreography: the target range is marked as the agent's focus
 * before the mutation, changed cells pulse in the agent color, and every
 * mutating tool answers with the recalc delta echo.
 */

const READ_CELL_CAP = 2000;
const WRITE_CELL_CAP = 20000;
const OVERVIEW_DENSE_CAP = 400;
const ECHO_LINE_CAP = 30;

export class AgentExecutor {
	constructor(private controller: WorkbookController) {}

	async execute(name: AgentToolName, input: unknown): Promise<string> {
		try {
			return this.dispatch(name, input);
		} catch (error) {
			return `error: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			this.controller.setAgentStatus({ phase: "idle" });
		}
	}

	private dispatch(name: AgentToolName, input: unknown): string {
		// Re-validate here so the executor is safe regardless of transport.
		switch (name) {
			case "get_workbook_overview":
				return this.overview();
			case "read_range":
				return this.readRange(agentToolSchemas.read_range.parse(input));
			case "set_cells":
				return this.setCells(agentToolSchemas.set_cells.parse(input));
			case "fill_range":
				return this.fillRange(agentToolSchemas.fill_range.parse(input));
			case "clear_range":
				return this.clearRange(agentToolSchemas.clear_range.parse(input));
			case "format_range":
				return this.formatRange(agentToolSchemas.format_range.parse(input));
			case "modify_structure":
				return this.modifyStructure(
					agentToolSchemas.modify_structure.parse(input),
				);
			case "add_sheet":
				return this.addSheet(agentToolSchemas.add_sheet.parse(input));
			case "rename_sheet":
				return this.renameSheet(agentToolSchemas.rename_sheet.parse(input));
			case "undo":
				return this.undo();
			case "highlight_cells":
				return this.highlight(agentToolSchemas.highlight_cells.parse(input));
		}
	}

	// ── helpers ──

	private sheetIndex(name: string): number {
		const sheets = this.controller.sheets();
		const index = sheets.findIndex(
			(sheet) => sheet.name.toLowerCase() === name.toLowerCase(),
		);
		if (index === -1) {
			const names = sheets.map((sheet) => sheet.name).join(", ");
			throw new Error(`no sheet named '${name}' (sheets: ${names})`);
		}
		return index;
	}

	private focus(sheet: number, range: CellRange | null, detail: string) {
		this.controller.setAgentStatus({
			phase: "working",
			detail,
			sheet,
			range: range ?? undefined,
		});
		// Bring the agent's work into view.
		if (this.controller.selectedSheet() !== sheet) {
			this.controller.view((model) => model.setSelectedSheet(sheet));
		}
	}

	private parseRangeOrThrow(text: string): CellRange {
		const range = parseRange(text);
		if (!range)
			throw new Error(`invalid range '${text}' — use A1 notation like B2:D10`);
		return range;
	}

	private echo(result: MutationResult): string {
		if (!result.ok) return `error: ${result.error}`;
		if (result.changes.length === 0) return "ok — no computed values changed";
		return `ok — ${result.changes.length} cell(s) changed:\n${formatChanges(result.changes)}`;
	}

	// ── reads ──

	private overview(): string {
		const sheets = this.controller.sheets();
		const lines: string[] = [`workbook: ${sheets.length} sheet(s)`];
		sheets.forEach((sheet, index) => {
			if (sheet.state !== "visible") return;
			const used = this.controller.usedRange(index);
			if (!used) {
				lines.push(`\n## ${sheet.name} — empty`);
				return;
			}
			lines.push(`\n## ${sheet.name} — used range ${formatRange(used)}`);
			if (cellCount(used) <= OVERVIEW_DENSE_CAP) {
				lines.push(this.renderGrid(index, used));
			} else {
				// Header row + shape hint.
				const headerRange = { ...used, endRow: used.startRow };
				lines.push(
					`row ${used.startRow}: ${this.renderGrid(index, headerRange)}`,
				);
				lines.push(
					`(${used.endRow - used.startRow} more rows × ${used.endCol - used.startCol + 1} columns — use read_range for details)`,
				);
			}
		});
		return lines.join("\n");
	}

	private renderGrid(sheet: number, range: CellRange): string {
		const rows: string[] = [];
		for (let row = range.startRow; row <= range.endRow; row++) {
			const cells: string[] = [];
			for (let col = range.startCol; col <= range.endCol; col++) {
				const content = this.controller.cellContent(sheet, row, col);
				const value = this.controller.formattedValue(sheet, row, col);
				if (content.startsWith("=")) cells.push(`${content} ⇒ ${value}`);
				else cells.push(value);
			}
			rows.push(`${row} | ${cells.join("\t")}`);
		}
		const header = Array.from(
			{ length: range.endCol - range.startCol + 1 },
			(_, i) => columnToLetters(range.startCol + i),
		).join("\t");
		return `  | ${header}\n${rows.join("\n")}`;
	}

	private readRange(input: AgentToolInput<"read_range">): string {
		const sheet = this.sheetIndex(input.sheet);
		const range = this.parseRangeOrThrow(input.range);
		this.focus(sheet, range, `reading ${input.range}`);
		if (cellCount(range) > READ_CELL_CAP) {
			return `error: range has ${cellCount(range)} cells (cap ${READ_CELL_CAP}) — read a smaller window`;
		}
		return `${input.sheet}!${formatRange(range)}\n${this.renderGrid(sheet, range)}`;
	}

	// ── mutations ──

	private setCells(input: AgentToolInput<"set_cells">): string {
		const sheet = this.sheetIndex(input.sheet);
		const start = parseCell(input.start_cell);
		if (!start) throw new Error(`invalid start_cell '${input.start_cell}'`);
		const height = input.rows.length;
		const width = Math.max(...input.rows.map((row) => row.length), 0);
		if (height === 0 || width === 0) throw new Error("rows is empty");
		if (height * width > WRITE_CELL_CAP) {
			throw new Error(
				`block has ${height * width} cells (cap ${WRITE_CELL_CAP}) — for large fills use fill_range`,
			);
		}
		const range: CellRange = {
			startRow: start.row,
			startCol: start.col,
			endRow: start.row + height - 1,
			endCol: start.col + width - 1,
		};
		this.focus(sheet, range, `writing ${formatRange(range)}`);
		const result = this.controller.mutate((model) => {
			model.pauseEvaluation();
			input.rows.forEach((row, r) => {
				row.forEach((value, c) => {
					const text = cellInputToString(value);
					if (text === "") return;
					model.setUserInput(sheet, start.row + r, start.col + c, text);
				});
			});
			model.resumeEvaluation();
			model.evaluate();
		}, "agent");
		return this.echo(result);
	}

	private fillRange(input: AgentToolInput<"fill_range">): string {
		const sheet = this.sheetIndex(input.sheet);
		const source = this.parseRangeOrThrow(input.source_range);
		const target = this.parseRangeOrThrow(input.target_range);
		if (
			target.startRow !== source.startRow ||
			target.startCol !== source.startCol ||
			(target.endCol !== source.endCol && target.endRow !== source.endRow)
		) {
			throw new Error(
				"target_range must contain source_range and extend it in exactly one direction",
			);
		}
		this.focus(sheet, target, `filling ${input.target_range}`);
		const result = this.controller.mutate((model) => {
			const area = this.controller.area(sheet, source);
			if (target.endRow > source.endRow) model.autoFillRows(area, target.endRow);
			else if (target.endCol > source.endCol) {
				model.autoFillColumns(area, target.endCol);
			}
		}, "agent");
		return this.echo(result);
	}

	private clearRange(input: AgentToolInput<"clear_range">): string {
		const sheet = this.sheetIndex(input.sheet);
		const range = this.parseRangeOrThrow(input.range);
		this.focus(sheet, range, `clearing ${input.range}`);
		const result = this.controller.mutate((model) => {
			const args = [
				sheet,
				range.startRow,
				range.startCol,
				range.endRow,
				range.endCol,
			] as const;
			if (input.what === "formats") model.rangeClearFormatting(...args);
			else if (input.what === "all") model.rangeClearAll(...args);
			else model.rangeClearContents(...args);
		}, "agent");
		return this.echo(result);
	}

	private formatRange(input: AgentToolInput<"format_range">): string {
		const sheet = this.sheetIndex(input.sheet);
		const range = this.parseRangeOrThrow(input.range);
		this.focus(sheet, range, `formatting ${input.range}`);
		const updates: [string, string][] = [];
		if (input.bold !== undefined) updates.push(["font.b", String(input.bold)]);
		if (input.italic !== undefined) updates.push(["font.i", String(input.italic)]);
		if (input.underline !== undefined) {
			updates.push(["font.u", String(input.underline)]);
		}
		if (input.text_color) updates.push(["font.color", input.text_color]);
		if (input.fill_color) updates.push(["fill.fg_color", input.fill_color]);
		if (input.horizontal_align) {
			updates.push(["alignment.horizontal", input.horizontal_align]);
		}
		if (input.number_format) updates.push(["num_fmt", input.number_format]);
		if (updates.length === 0) return "error: no formatting properties given";
		const result = this.controller.mutate((model) => {
			const area = this.controller.area(sheet, range);
			for (const [path, value] of updates) {
				model.updateRangeStyle(area, path, value);
			}
		}, "agent");
		return result.ok
			? `ok — formatted ${formatRange(range)}`
			: `error: ${result.error}`;
	}

	private modifyStructure(input: AgentToolInput<"modify_structure">): string {
		const sheet = this.sheetIndex(input.sheet);
		this.focus(
			sheet,
			null,
			`${input.operation.replace("_", " ")} at ${input.index}`,
		);
		const result = this.controller.mutate((model) => {
			if (input.operation === "insert_rows") {
				model.insertRows(sheet, input.index, input.count);
			} else if (input.operation === "delete_rows") {
				model.deleteRows(sheet, input.index, input.count);
			} else if (input.operation === "insert_columns") {
				model.insertColumns(sheet, input.index, input.count);
			} else model.deleteColumns(sheet, input.index, input.count);
		}, "agent");
		return this.echo(result);
	}

	private addSheet(input: AgentToolInput<"add_sheet">): string {
		const result = this.controller.mutate((model) => {
			model.newSheet();
			if (input.name) {
				model.renameSheet(this.controller.sheets().length - 1, input.name);
			}
		}, "agent");
		if (!result.ok) return `error: ${result.error}`;
		const sheets = this.controller.sheets();
		const created = sheets[sheets.length - 1];
		this.controller.view((model) => model.setSelectedSheet(sheets.length - 1));
		return `ok — added sheet '${created?.name ?? "?"}'`;
	}

	private renameSheet(input: AgentToolInput<"rename_sheet">): string {
		const sheet = this.sheetIndex(input.sheet);
		const result = this.controller.mutate((model) => {
			model.renameSheet(sheet, input.new_name);
		}, "agent");
		return result.ok
			? `ok — renamed to '${input.new_name}'`
			: `error: ${result.error}`;
	}

	private undo(): string {
		const result = this.controller.mutate((model) => model.undo(), "agent");
		return this.echo(result);
	}

	private highlight(input: AgentToolInput<"highlight_cells">): string {
		const sheet = this.sheetIndex(input.sheet);
		const range = this.parseRangeOrThrow(input.range);
		this.focus(sheet, range, `highlighting ${input.range}`);
		this.controller.addHighlight({ sheet, range, note: input.note });
		return `ok — highlighted ${input.sheet}!${formatRange(range)}`;
	}
}

/** Normalize a set_cells entry to engine user input; null/'' means "skip". */
function cellInputToString(value: string | number | boolean | null): string {
	if (value === null) return "";
	if (typeof value === "number") return String(value);
	if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
	return value;
}

function formatChanges(changes: CellChange[]): string {
	const lines = changes
		.slice(0, ECHO_LINE_CAP)
		.map(
			(c) =>
				`  ${c.cell}: ${c.old === "" ? "(empty)" : c.old} ⇒ ${c.new === "" ? "(empty)" : c.new}`,
		);
	if (changes.length > ECHO_LINE_CAP) {
		lines.push(`  … and ${changes.length - ECHO_LINE_CAP} more`);
	}
	return lines.join("\n");
}

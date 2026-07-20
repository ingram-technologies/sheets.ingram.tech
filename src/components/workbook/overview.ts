import type { CellRange } from "@/lib/a1";
import { cellCount, columnToLetters, formatRange } from "@/lib/a1";

import type { WorkbookController } from "./controller";
import { ensureSheetkit, WasmSession } from "./sheetkit";

/**
 * The workbook overview the agent sees: served by the `get_workbook_overview`
 * tool AND auto-attached to every user chat message. Built by the sheetkit
 * engine (same pinned IronCalc rev, so `Model.toBytes()` feeds straight into
 * `WasmSession.fromBytes`): a structure-aware sketch — regions, headers,
 * column types, fills, sortedness — plus dense cell grids for sheets small
 * enough to show whole. Falls back to the plain TS overview if the sheetkit
 * module can't load.
 */

const OVERVIEW_DENSE_CAP = 400;

export async function buildAgentOverview(
	controller: WorkbookController,
): Promise<string> {
	try {
		await ensureSheetkit();
		const session = WasmSession.fromBytes(controller.model.toBytes());
		try {
			const sketch = session.sketch();
			const dense = denseSections(controller);
			return dense ? `${sketch}\n\n${dense}` : sketch;
		} finally {
			session.free();
		}
	} catch {
		// Engine-bytes mismatch or module load failure — degrade, don't break chat.
		return buildWorkbookOverview(controller);
	}
}

/** Full cell grids for every visible sheet small enough to include whole. */
function denseSections(controller: WorkbookController): string {
	const sections: string[] = [];
	controller.sheets().forEach((sheet, index) => {
		if (sheet.state !== "visible") return;
		const used = controller.usedRange(index);
		if (!used || cellCount(used) > OVERVIEW_DENSE_CAP) return;
		sections.push(
			`cells ${sheet.name}!${formatRange(used)}:\n${renderGridText(controller, index, used)}`,
		);
	});
	return sections.join("\n\n");
}

/**
 * Legacy TS overview: sheets, used ranges, and cell contents (small sheets in
 * full, big ones as header row + shape). Kept as the fallback path.
 */
export function buildWorkbookOverview(controller: WorkbookController): string {
	const sheets = controller.sheets();
	const lines: string[] = [`workbook: ${sheets.length} sheet(s)`];
	sheets.forEach((sheet, index) => {
		if (sheet.state !== "visible") return;
		const used = controller.usedRange(index);
		if (!used) {
			lines.push(`\n## ${sheet.name} — empty`);
			return;
		}
		lines.push(`\n## ${sheet.name} — used range ${formatRange(used)}`);
		if (cellCount(used) <= OVERVIEW_DENSE_CAP) {
			lines.push(renderGridText(controller, index, used));
		} else {
			// Header row + shape hint.
			const headerRange = { ...used, endRow: used.startRow };
			lines.push(
				`row ${used.startRow}: ${renderGridText(controller, index, headerRange)}`,
			);
			lines.push(
				`(${used.endRow - used.startRow} more rows × ${used.endCol - used.startCol + 1} columns — use read_range for details)`,
			);
		}
	});
	return lines.join("\n");
}

export function renderGridText(
	controller: WorkbookController,
	sheet: number,
	range: CellRange,
): string {
	const rows: string[] = [];
	for (let row = range.startRow; row <= range.endRow; row++) {
		const cells: string[] = [];
		for (let col = range.startCol; col <= range.endCol; col++) {
			const content = controller.cellContent(sheet, row, col);
			const value = controller.formattedValue(sheet, row, col);
			if (content.startsWith("=")) cells.push(`${content} ⇒ ${value}`);
			else cells.push(value);
		}
		rows.push(`${row} | ${cells.join("\t")}`);
	}
	const header = Array.from({ length: range.endCol - range.startCol + 1 }, (_, i) =>
		columnToLetters(range.startCol + i),
	).join("\t");
	return `  | ${header}\n${rows.join("\n")}`;
}

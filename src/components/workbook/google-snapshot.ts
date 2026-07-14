import type { SnapshotCell, WorkbookSnapshot } from "@/lib/gsheets-transfer";

import type { WorkbookController } from "./controller";
import { Model } from "./ironcalc";

/**
 * Browser half of the Google Sheets bridge: the engine lives here, so the
 * snapshot (values, formulas, number formats — see `lib/gsheets-transfer`)
 * is built and consumed client-side; the server only speaks snapshot ⇄
 * Google API. Richer style transfer can layer on later.
 */

/** CellType per TYPE(): 1 number, 2 text, 4 boolean. */
const TYPE_NUMBER = 1;
const TYPE_BOOLEAN = 4;

export function buildGoogleSnapshot(controller: WorkbookController): WorkbookSnapshot {
	const sheets: WorkbookSnapshot["sheets"] = [];
	controller.sheets().forEach((props, sheetIndex) => {
		if (props.state !== "visible") return;
		const cells: SnapshotCell[] = [];
		const used = controller.usedRange(sheetIndex);
		if (used) {
			for (let col = 1; col <= used.endCol; col++) {
				for (const row of controller.model.getRowsWithData(sheetIndex, col)) {
					const content = controller.cellContent(sheetIndex, row, col);
					if (content === "") continue;
					const cell: SnapshotCell = { r: row, c: col };
					if (content.startsWith("=")) {
						cell.f = content;
					} else {
						const type = controller.model.getCellType(sheetIndex, row, col);
						if (type === TYPE_NUMBER) cell.v = Number(content);
						else if (type === TYPE_BOOLEAN) {
							cell.v = content.toUpperCase() === "TRUE";
						} else cell.v = content;
					}
					const numFmt = controller.cellStyle(sheetIndex, row, col).num_fmt;
					if (numFmt && numFmt !== "general") cell.nf = numFmt;
					cells.push(cell);
				}
			}
		}
		sheets.push({ name: props.name, cells });
	});
	return { sheets };
}

/**
 * Build a fresh engine workbook from an imported snapshot. Caller must have
 * awaited `ensureIronCalc()`. Per-cell failures (a formula Google accepts but
 * the engine rejects, an unrenamable sheet title) degrade to skipping that
 * detail rather than failing the import.
 */
export function modelFromSnapshot(title: string, snapshot: WorkbookSnapshot): Model {
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
	const model = new Model(title || "workbook", "en", timezone, "en");
	snapshot.sheets.forEach((sheet, index) => {
		if (index > 0) model.newSheet();
		try {
			model.renameSheet(index, sheet.name);
		} catch {
			// Keep the default name when the imported title is invalid here.
		}
	});
	snapshot.sheets.forEach((sheet, index) => {
		for (const cell of sheet.cells) {
			const input =
				cell.f ??
				(typeof cell.v === "boolean"
					? cell.v
						? "TRUE"
						: "FALSE"
					: typeof cell.v === "number"
						? String(cell.v)
						: (cell.v ?? ""));
			if (input !== "") {
				try {
					model.setUserInput(index, cell.r, cell.c, input);
				} catch {
					continue;
				}
			}
			if (cell.nf) {
				try {
					model.updateRangeStyle(
						{
							sheet: index,
							row: cell.r,
							column: cell.c,
							width: 1,
							height: 1,
						},
						"num_fmt",
						cell.nf,
					);
				} catch {
					// Unsupported pattern — keep the value unformatted.
				}
			}
		}
	});
	return model;
}

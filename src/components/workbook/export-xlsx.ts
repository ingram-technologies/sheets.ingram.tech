import type { WorkbookController } from "./controller";

/**
 * Client-side xlsx export: walk the engine's used range per sheet and rebuild
 * the workbook with exceljs (values, formulas, fonts, fills, number formats,
 * alignment, column widths, row heights). The wasm binding doesn't expose
 * IronCalc's own xlsx writer, so this is a faithful-enough reconstruction —
 * formulas are written without cached results and recalculate on open.
 * exceljs is imported lazily; it only loads when someone actually downloads.
 */

// IronCalc default column width 125px ↔ Excel default 8.43 chars;
// default row height 28px ↔ 15pt.
const PX_TO_CHARS = 8.43 / 125;
const PX_TO_POINTS = 15 / 28;

/** CellType per TYPE(): 1 number, 2 text, 4 boolean. */
const TYPE_NUMBER = 1;
const TYPE_BOOLEAN = 4;

export async function exportXlsx(
	controller: WorkbookController,
	fileName: string,
): Promise<void> {
	const buffer = await buildXlsxBuffer(controller);
	const blob = new Blob([buffer], {
		type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	});
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = fileName.toLowerCase().endsWith(".xlsx")
		? fileName
		: `${fileName}.xlsx`;
	anchor.click();
	URL.revokeObjectURL(url);
}

export async function buildXlsxBuffer(
	controller: WorkbookController,
): Promise<ArrayBuffer> {
	const { Workbook } = await import("exceljs");
	const workbook = new Workbook();
	const model = controller.model;

	controller.sheets().forEach((sheetProps, sheetIndex) => {
		if (sheetProps.state !== "visible") return;
		const sheet = workbook.addWorksheet(sheetProps.name);
		const used = controller.usedRange(sheetIndex);
		if (!used) return;

		for (let col = 1; col <= used.endCol; col++) {
			const px = model.getColumnWidth(sheetIndex, col);
			sheet.getColumn(col).width = Math.max(px * PX_TO_CHARS, 1);
		}

		for (let row = 1; row <= used.endRow; row++) {
			const heightPx = model.getRowHeight(sheetIndex, row);
			sheet.getRow(row).height = heightPx * PX_TO_POINTS;
			for (let col = 1; col <= used.endCol; col++) {
				const content = controller.cellContent(sheetIndex, row, col);
				const style = controller.cellStyle(sheetIndex, row, col);
				const cell = sheet.getCell(row, col);

				if (content !== "") {
					if (content.startsWith("=")) {
						cell.value = { formula: content.slice(1) };
					} else {
						const cellType = model.getCellType(sheetIndex, row, col);
						if (cellType === TYPE_NUMBER) cell.value = Number(content);
						else if (cellType === TYPE_BOOLEAN) {
							cell.value = content.toUpperCase() === "TRUE";
						} else cell.value = content;
					}
				}

				const font: Record<string, unknown> = {};
				if (style.font.b) font.bold = true;
				if (style.font.i) font.italic = true;
				if (style.font.u) font.underline = true;
				if (style.font.strike) font.strike = true;
				if (style.font.sz) font.size = style.font.sz;
				const fontColor = toArgb(controller.resolveColor(style.font.color));
				// Skip default black — let Excel's theme drive it.
				if (fontColor && fontColor !== "FF000000")
					font.color = { argb: fontColor };
				if (Object.keys(font).length > 0) cell.font = font;

				const fillColor = toArgb(controller.resolveColor(style.fill.color));
				if (fillColor) {
					cell.fill = {
						type: "pattern",
						pattern: "solid",
						fgColor: { argb: fillColor },
					};
				}

				if (style.num_fmt && style.num_fmt !== "general") {
					cell.numFmt = style.num_fmt;
				}

				const alignment: Record<string, unknown> = {};
				const horizontal = style.alignment?.horizontal;
				if (horizontal && horizontal !== "general")
					alignment.horizontal = horizontal;
				const vertical = style.alignment?.vertical;
				if (vertical && vertical !== "bottom") alignment.vertical = vertical;
				if (style.alignment?.wrap_text) alignment.wrapText = true;
				if (Object.keys(alignment).length > 0) cell.alignment = alignment;
			}
		}
	});

	return workbook.xlsx.writeBuffer();
}

/** "#rrggbb" / "#rrggbbaa" → excel ARGB, or null when unset/unparseable. */
function toArgb(color: string | undefined): string | null {
	if (!color) return null;
	const hex = color.replace("#", "").toUpperCase();
	if (hex.length === 6) return `FF${hex}`;
	if (hex.length === 8) return `${hex.slice(6)}${hex.slice(0, 6)}`;
	return null;
}

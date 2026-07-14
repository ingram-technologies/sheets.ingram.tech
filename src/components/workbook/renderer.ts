/**
 * Canvas renderer for the worksheet. Pure drawing — no React, no state. The
 * Grid component owns the canvas, scroll position, and interaction; this
 * module turns (controller, viewport) into pixels each frame.
 */
import type { CellRange } from "@/lib/a1";
import { columnToLetters } from "@/lib/a1";

import type { WorkbookController } from "./controller";

export const ROW_HEADER_WIDTH = 48;
export const COL_HEADER_HEIGHT = 26;
export const FILL_HANDLE_SIZE = 7;

export interface SheetColors {
	cellBg: string;
	cellFg: string;
	gridLine: string;
	headerBg: string;
	headerFg: string;
	headerActiveBg: string;
	selection: string;
	selectionBg: string;
	agent: string;
	agentBg: string;
	pulse: string;
	font: string;
}

export function readSheetColors(element: HTMLElement): SheetColors {
	const style = getComputedStyle(element);
	const v = (name: string) => style.getPropertyValue(name).trim();
	return {
		cellBg: v("--sheet-cell-bg"),
		cellFg: v("--sheet-cell-fg"),
		gridLine: v("--sheet-grid-line"),
		headerBg: v("--sheet-header-bg"),
		headerFg: v("--sheet-header-fg"),
		headerActiveBg: v("--sheet-header-active-bg"),
		selection: v("--sheet-selection"),
		selectionBg: v("--sheet-selection-bg"),
		agent: v("--sheet-agent"),
		agentBg: v("--sheet-agent-bg"),
		pulse: v("--sheet-pulse"),
		font: v("--sheet-font") || "sans-serif",
	};
}

export interface Viewport {
	scrollX: number;
	scrollY: number;
	width: number;
	height: number;
}

export interface VisibleRange {
	rowStart: number;
	rowEnd: number;
	colStart: number;
	colEnd: number;
}

function lowerBound(offsets: number[], target: number): number {
	// last index i with offsets[i] <= target
	let lo = 0;
	let hi = offsets.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if ((offsets[mid] ?? 0) <= target) lo = mid;
		else hi = mid - 1;
	}
	return lo;
}

export function visibleRange(
	controller: WorkbookController,
	sheet: number,
	viewport: Viewport,
): VisibleRange {
	const geo = controller.sheetGeometry(sheet);
	const rowStart = Math.min(
		lowerBound(geo.rowOffsets, viewport.scrollY) + 1,
		geo.rows,
	);
	const colStart = Math.min(
		lowerBound(geo.colOffsets, viewport.scrollX) + 1,
		geo.cols,
	);
	const rowEnd = Math.min(
		lowerBound(geo.rowOffsets, viewport.scrollY + viewport.height) + 1,
		geo.rows,
	);
	const colEnd = Math.min(
		lowerBound(geo.colOffsets, viewport.scrollX + viewport.width) + 1,
		geo.cols,
	);
	return { rowStart, rowEnd, colStart, colEnd };
}

/** Pixel rect of a cell relative to the canvas (grid area starts after headers). */
export function cellRect(
	controller: WorkbookController,
	sheet: number,
	row: number,
	col: number,
	viewport: Viewport,
): { x: number; y: number; w: number; h: number } {
	const geo = controller.sheetGeometry(sheet);
	const x = (geo.colOffsets[col - 1] ?? 0) - viewport.scrollX + ROW_HEADER_WIDTH;
	const y = (geo.rowOffsets[row - 1] ?? 0) - viewport.scrollY + COL_HEADER_HEIGHT;
	const w = (geo.colOffsets[col] ?? 0) - (geo.colOffsets[col - 1] ?? 0);
	const h = (geo.rowOffsets[row] ?? 0) - (geo.rowOffsets[row - 1] ?? 0);
	return { x, y, w, h };
}

function rangeRect(
	controller: WorkbookController,
	sheet: number,
	range: CellRange,
	viewport: Viewport,
): { x: number; y: number; w: number; h: number } {
	const start = cellRect(controller, sheet, range.startRow, range.startCol, viewport);
	const end = cellRect(controller, sheet, range.endRow, range.endCol, viewport);
	return {
		x: start.x,
		y: start.y,
		w: end.x + end.w - start.x,
		h: end.y + end.h - start.y,
	};
}

export interface RenderParams {
	controller: WorkbookController;
	sheet: number;
	viewport: Viewport;
	colors: SheetColors;
	dpr: number;
	/** Cell being edited — its content is drawn by the DOM editor, not us. */
	editing?: { row: number; col: number } | null;
	now: number;
}

export function render(ctx: CanvasRenderingContext2D, params: RenderParams): void {
	const { controller, sheet, viewport, colors, dpr, now } = params;
	const { width, height } = viewport;
	ctx.save();
	ctx.scale(dpr, dpr);
	ctx.fillStyle = colors.cellBg;
	ctx.fillRect(0, 0, width, height);

	const visible = visibleRange(controller, sheet, viewport);
	const view = controller.selectedView();
	const selection: CellRange = {
		startRow: Math.min(view.range[0], view.range[2]),
		startCol: Math.min(view.range[1], view.range[3]),
		endRow: Math.max(view.range[0], view.range[2]),
		endCol: Math.max(view.range[1], view.range[3]),
	};

	drawGridLines(ctx, params, visible);
	drawCells(ctx, params, visible);
	drawSelection(ctx, params, selection);
	drawPulses(ctx, params, now);
	drawHighlights(ctx, params);
	drawHeaders(ctx, params, visible, selection);
	ctx.restore();
}

function drawGridLines(
	ctx: CanvasRenderingContext2D,
	params: RenderParams,
	visible: VisibleRange,
): void {
	const { controller, sheet, viewport, colors } = params;
	const geo = controller.sheetGeometry(sheet);
	ctx.strokeStyle = colors.gridLine;
	ctx.lineWidth = 1;
	ctx.beginPath();
	for (let col = visible.colStart; col <= visible.colEnd + 1; col++) {
		const x =
			Math.round(
				(geo.colOffsets[col - 1] ?? 0) - viewport.scrollX + ROW_HEADER_WIDTH,
			) + 0.5;
		if (x < ROW_HEADER_WIDTH) continue;
		ctx.moveTo(x, COL_HEADER_HEIGHT);
		ctx.lineTo(x, viewport.height);
	}
	for (let row = visible.rowStart; row <= visible.rowEnd + 1; row++) {
		const y =
			Math.round(
				(geo.rowOffsets[row - 1] ?? 0) - viewport.scrollY + COL_HEADER_HEIGHT,
			) + 0.5;
		if (y < COL_HEADER_HEIGHT) continue;
		ctx.moveTo(ROW_HEADER_WIDTH, y);
		ctx.lineTo(viewport.width, y);
	}
	ctx.stroke();
}

/** CellType per TYPE(): 1 number, 2 text, 4 boolean, 16 error. */
function generalAlignment(cellType: number): CanvasTextAlign {
	if (cellType === 2) return "left";
	if (cellType === 1) return "right";
	return "center";
}

const CELL_PADDING = 5;
const MAX_SPILL_COLS = 8;

function drawCells(
	ctx: CanvasRenderingContext2D,
	params: RenderParams,
	visible: VisibleRange,
): void {
	const { controller, sheet, viewport, colors, editing } = params;

	// Backgrounds first (they cover grid lines), then text.
	for (let row = visible.rowStart; row <= visible.rowEnd; row++) {
		for (let col = visible.colStart; col <= visible.colEnd; col++) {
			const style = controller.cellStyle(sheet, row, col);
			const bg = style.fill.fg_color;
			if (style.fill.pattern_type !== "none" && bg) {
				const rect = cellRect(controller, sheet, row, col, viewport);
				ctx.fillStyle = bg;
				ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
			}
		}
	}

	ctx.textBaseline = "middle";
	for (let row = visible.rowStart; row <= visible.rowEnd; row++) {
		for (let col = visible.colStart; col <= visible.colEnd; col++) {
			if (editing && editing.row === row && editing.col === col) continue;
			const text = controller.formattedValue(sheet, row, col);
			if (text === "") continue;
			const rect = cellRect(controller, sheet, row, col, viewport);
			const style = controller.cellStyle(sheet, row, col);
			const font = style.font;
			const px = Math.round((font.sz || 11) * (4 / 3));
			ctx.font = `${font.i ? "italic " : ""}${font.b ? "600" : "400"} ${px}px ${colors.font}`;
			ctx.fillStyle = font.color || colors.cellFg;

			const cellType = controller.model.getCellType(sheet, row, col);
			const horizontal = style.alignment?.horizontal ?? "general";
			const align: CanvasTextAlign =
				horizontal === "general"
					? generalAlignment(cellType)
					: horizontal === "right"
						? "right"
						: horizontal === "center" || horizontal === "centerContinuous"
							? "center"
							: "left";

			// Allow left-aligned text to spill over trailing empty cells.
			let clipW = rect.w;
			if (align === "left") {
				const measured = ctx.measureText(text).width + CELL_PADDING * 2;
				let nextCol = col + 1;
				while (
					measured > clipW &&
					nextCol <= col + MAX_SPILL_COLS &&
					controller.formattedValue(sheet, row, nextCol) === ""
				) {
					clipW += cellRect(controller, sheet, row, nextCol, viewport).w;
					nextCol += 1;
				}
			}

			ctx.save();
			ctx.beginPath();
			ctx.rect(rect.x, rect.y, clipW, rect.h);
			ctx.clip();
			ctx.textAlign = align;
			const tx =
				align === "right"
					? rect.x + rect.w - CELL_PADDING
					: align === "center"
						? rect.x + rect.w / 2
						: rect.x + CELL_PADDING;
			const ty = rect.y + rect.h / 2 + 1;
			ctx.fillText(text, tx, ty);
			if (font.u || font.strike) {
				const w = Math.min(ctx.measureText(text).width, clipW - CELL_PADDING);
				const lx =
					align === "right" ? tx - w : align === "center" ? tx - w / 2 : tx;
				ctx.strokeStyle = ctx.fillStyle;
				ctx.lineWidth = 1;
				if (font.u) {
					ctx.beginPath();
					ctx.moveTo(lx, ty + px / 2 - 1);
					ctx.lineTo(lx + w, ty + px / 2 - 1);
					ctx.stroke();
				}
				if (font.strike) {
					ctx.beginPath();
					ctx.moveTo(lx, ty);
					ctx.lineTo(lx + w, ty);
					ctx.stroke();
				}
			}
			ctx.restore();
		}
	}
}

function drawSelection(
	ctx: CanvasRenderingContext2D,
	params: RenderParams,
	selection: CellRange,
): void {
	const { controller, sheet, viewport, colors } = params;
	const view = controller.selectedView();
	if (view.sheet !== sheet) return;

	const rect = rangeRect(controller, sheet, selection, viewport);
	const multi =
		selection.startRow !== selection.endRow ||
		selection.startCol !== selection.endCol;
	if (multi) {
		// Shade the range but leave the active cell unshaded (even-odd fill),
		// so you can see where typing lands.
		const active = cellRect(controller, sheet, view.row, view.column, viewport);
		ctx.fillStyle = colors.selectionBg;
		ctx.beginPath();
		ctx.rect(rect.x, rect.y, rect.w, rect.h);
		ctx.rect(active.x, active.y, active.w, active.h);
		ctx.fill("evenodd");
	}
	ctx.strokeStyle = colors.selection;
	ctx.lineWidth = 2;
	ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);

	// Fill handle.
	ctx.fillStyle = colors.selection;
	ctx.fillRect(
		rect.x + rect.w - FILL_HANDLE_SIZE / 2 - 1,
		rect.y + rect.h - FILL_HANDLE_SIZE / 2 - 1,
		FILL_HANDLE_SIZE,
		FILL_HANDLE_SIZE,
	);
	ctx.strokeStyle = colors.cellBg;
	ctx.lineWidth = 1;
	ctx.strokeRect(
		rect.x + rect.w - FILL_HANDLE_SIZE / 2 - 1.5,
		rect.y + rect.h - FILL_HANDLE_SIZE / 2 - 1.5,
		FILL_HANDLE_SIZE + 1,
		FILL_HANDLE_SIZE + 1,
	);
}

function drawPulses(
	ctx: CanvasRenderingContext2D,
	params: RenderParams,
	now: number,
): void {
	const { controller, sheet, viewport, colors } = params;
	for (const pulse of controller.activePulses(now)) {
		if (pulse.sheet !== sheet) continue;
		const rect = cellRect(controller, sheet, pulse.row, pulse.col, viewport);
		const alpha = Math.max(0, (pulse.until - now) / 900);
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.fillStyle = pulse.kind === "agent" ? colors.agentBg : colors.pulse;
		ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
		ctx.restore();
	}
}

function drawHighlights(ctx: CanvasRenderingContext2D, params: RenderParams): void {
	const { controller, sheet, viewport, colors } = params;
	for (const highlight of controller.highlights) {
		if (highlight.sheet !== sheet) continue;
		const rect = rangeRect(controller, sheet, highlight.range, viewport);
		ctx.fillStyle = colors.agentBg;
		ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
		ctx.strokeStyle = colors.agent;
		ctx.lineWidth = 2;
		ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
		if (highlight.note) {
			// Note marker: folded corner, top-right.
			ctx.fillStyle = colors.agent;
			ctx.beginPath();
			ctx.moveTo(rect.x + rect.w - 10, rect.y + 1);
			ctx.lineTo(rect.x + rect.w - 1, rect.y + 1);
			ctx.lineTo(rect.x + rect.w - 1, rect.y + 10);
			ctx.closePath();
			ctx.fill();
		}
	}
	// Agent focus target (what the agent is currently looking at / working on).
	const status = controller.agentStatus;
	if (status.range && status.sheet === sheet && status.phase !== "idle") {
		const rect = rangeRect(controller, sheet, status.range, viewport);
		ctx.strokeStyle = colors.agent;
		ctx.lineWidth = 2;
		ctx.setLineDash([6, 4]);
		ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
		ctx.setLineDash([]);
	}
}

function drawHeaders(
	ctx: CanvasRenderingContext2D,
	params: RenderParams,
	visible: VisibleRange,
	selection: CellRange,
): void {
	const { controller, sheet, viewport, colors } = params;
	const geo = controller.sheetGeometry(sheet);

	// Column header strip.
	ctx.fillStyle = colors.headerBg;
	ctx.fillRect(0, 0, viewport.width, COL_HEADER_HEIGHT);
	ctx.fillRect(0, 0, ROW_HEADER_WIDTH, viewport.height);

	ctx.textBaseline = "middle";
	ctx.textAlign = "center";
	ctx.font = `400 11px ${colors.font}`;

	for (let col = visible.colStart; col <= visible.colEnd; col++) {
		const x = (geo.colOffsets[col - 1] ?? 0) - viewport.scrollX + ROW_HEADER_WIDTH;
		const w = (geo.colOffsets[col] ?? 0) - (geo.colOffsets[col - 1] ?? 0);
		const selected = col >= selection.startCol && col <= selection.endCol;
		if (selected) {
			ctx.fillStyle = colors.headerActiveBg;
			ctx.fillRect(x, 0, w, COL_HEADER_HEIGHT);
		}
		ctx.fillStyle = colors.headerFg;
		ctx.fillText(columnToLetters(col), x + w / 2, COL_HEADER_HEIGHT / 2 + 1, w - 4);
	}

	for (let row = visible.rowStart; row <= visible.rowEnd; row++) {
		const y = (geo.rowOffsets[row - 1] ?? 0) - viewport.scrollY + COL_HEADER_HEIGHT;
		const h = (geo.rowOffsets[row] ?? 0) - (geo.rowOffsets[row - 1] ?? 0);
		const selected = row >= selection.startRow && row <= selection.endRow;
		if (selected) {
			ctx.fillStyle = colors.headerActiveBg;
			ctx.fillRect(0, y, ROW_HEADER_WIDTH, h);
		}
		ctx.fillStyle = colors.headerFg;
		ctx.fillText(
			String(row),
			ROW_HEADER_WIDTH / 2,
			y + h / 2 + 1,
			ROW_HEADER_WIDTH - 6,
		);
	}

	// Header borders + corner.
	ctx.strokeStyle = colors.gridLine;
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(0, COL_HEADER_HEIGHT + 0.5);
	ctx.lineTo(viewport.width, COL_HEADER_HEIGHT + 0.5);
	ctx.moveTo(ROW_HEADER_WIDTH + 0.5, 0);
	ctx.lineTo(ROW_HEADER_WIDTH + 0.5, viewport.height);
	ctx.stroke();

	// Per-column/row separator ticks in the headers.
	ctx.beginPath();
	for (let col = visible.colStart; col <= visible.colEnd; col++) {
		const x =
			Math.round(
				(geo.colOffsets[col] ?? 0) - viewport.scrollX + ROW_HEADER_WIDTH,
			) + 0.5;
		if (x <= ROW_HEADER_WIDTH) continue;
		ctx.moveTo(x, 6);
		ctx.lineTo(x, COL_HEADER_HEIGHT);
	}
	for (let row = visible.rowStart; row <= visible.rowEnd; row++) {
		const y =
			Math.round(
				(geo.rowOffsets[row] ?? 0) - viewport.scrollY + COL_HEADER_HEIGHT,
			) + 0.5;
		if (y <= COL_HEADER_HEIGHT) continue;
		ctx.moveTo(8, y);
		ctx.lineTo(ROW_HEADER_WIDTH, y);
	}
	ctx.stroke();

	// Selection accent line on headers (the thin colored edge).
	ctx.fillStyle = colors.selection;
	const selRect = rangeRect(controller, sheet, selection, params.viewport);
	const hx = Math.max(selRect.x, ROW_HEADER_WIDTH);
	const hw = Math.min(selRect.w - (hx - selRect.x), viewport.width - hx);
	if (hw > 0) ctx.fillRect(hx, COL_HEADER_HEIGHT - 2, hw, 2);
	const hy = Math.max(selRect.y, COL_HEADER_HEIGHT);
	const hh = Math.min(selRect.h - (hy - selRect.y), viewport.height - hy);
	if (hh > 0) ctx.fillRect(ROW_HEADER_WIDTH - 2, hy, 2, hh);
}

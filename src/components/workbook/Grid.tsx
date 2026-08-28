"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

import type { CellRange } from "@/lib/a1";
import { MAX_COLUMN, MAX_ROW } from "@/lib/a1";

import type { CommitMove } from "./CellEditor";
import { CellEditor } from "./CellEditor";
import type { WorkbookController } from "./controller";
import {
	cellRect,
	COL_HEADER_HEIGHT,
	FILL_HANDLE_SIZE,
	readSheetColors,
	render,
	ROW_HEADER_WIDTH,
} from "./renderer";

export interface EditingState {
	row: number;
	col: number;
	initial: string;
	/** replace = typed over the cell; edit = F2/double-click on existing content */
	mode: "replace" | "edit";
}

interface DragState {
	kind: "select" | "colResize" | "rowResize" | "fill";
	index?: number;
	startPos?: number;
	startSize?: number;
	source?: CellRange;
	fillTarget?: CellRange | null;
	previewSize?: number;
}

interface MenuState {
	x: number;
	y: number;
	kind: "col" | "row" | "cell";
	index: number;
}

type EngineClipboardData = ReturnType<
	WorkbookController["model"]["copyToClipboard"]
>["data"];

interface InternalClipboard {
	csv: string;
	data: EngineClipboardData;
	range: [number, number, number, number];
	sheet: number;
	cut: boolean;
}

const RESIZE_GRIP = 4;

export function Grid({
	controller,
	editing,
	setEditing,
}: {
	controller: WorkbookController;
	editing: EditingState | null;
	setEditing: (state: EditingState | null) => void;
}) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef({ x: 0, y: 0 });
	const dragRef = useRef<DragState | null>(null);
	const clipboardRef = useRef<InternalClipboard | null>(null);
	const rafRef = useRef(0);
	const editingValueRef = useRef("");
	const [menu, setMenu] = useState<MenuState | null>(null);
	const [cursor, setCursor] = useState("cell");
	const [resizeGuide, setResizeGuide] = useState<{
		axis: "col" | "row";
		pos: number;
	} | null>(null);

	const version = useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);
	const revealSeq = useSyncExternalStore(
		controller.subscribe,
		controller.getRevealSeq,
		controller.getRevealSeq,
	);

	const sheet = controller.selectedSheet();
	const geometry = controller.sheetGeometry(sheet);

	const draw = useCallback(() => {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const dpr = window.devicePixelRatio || 1;
		const width = container.clientWidth;
		const height = container.clientHeight;
		if (canvas.width !== Math.round(width * dpr))
			canvas.width = Math.round(width * dpr);
		if (canvas.height !== Math.round(height * dpr)) {
			canvas.height = Math.round(height * dpr);
		}
		const now = performance.now();
		render(ctx, {
			controller,
			sheet: controller.selectedSheet(),
			viewport: {
				scrollX: scrollRef.current.x,
				scrollY: scrollRef.current.y,
				width,
				height,
			},
			colors: readSheetColors(container),
			dpr,
			editing: editing ? { row: editing.row, col: editing.col } : null,
			now,
		});
		// Keep animating while pulses are live.
		if (controller.activePulses(now).length > 0) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = requestAnimationFrame(draw);
		}
	}, [controller, editing]);

	// Redraw on model change, resize, theme flip.
	useEffect(() => {
		draw();
	}, [draw, version]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		const observer = new ResizeObserver(() => {
			const model = controller.model;
			model.setWindowWidth(container.clientWidth - ROW_HEADER_WIDTH);
			model.setWindowHeight(container.clientHeight - COL_HEADER_HEIGHT);
			draw();
		});
		observer.observe(container);
		const themeObserver = new MutationObserver(draw);
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["class"],
		});
		return () => {
			observer.disconnect();
			themeObserver.disconnect();
			cancelAnimationFrame(rafRef.current);
		};
	}, [controller, draw]);

	const onScroll = useCallback(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		scrollRef.current = { x: scroller.scrollLeft, y: scroller.scrollTop };
		// Grow the virtual extent when nearing the edge.
		const nearBottom =
			scroller.scrollTop + scroller.clientHeight >
			scroller.scrollHeight - COL_HEADER_HEIGHT - 200;
		const nearRight =
			scroller.scrollLeft + scroller.clientWidth >
			scroller.scrollWidth - ROW_HEADER_WIDTH - 300;
		if (nearBottom || nearRight) {
			controller.extendExtent(
				controller.selectedSheet(),
				Math.min(geometry.rows + (nearBottom ? 200 : 0), MAX_ROW),
				Math.min(geometry.cols + (nearRight ? 10 : 0), MAX_COLUMN),
			);
		}
		draw();
	}, [controller, draw, geometry.cols, geometry.rows]);

	// ── coordinate helpers ──

	const locate = useCallback(
		(clientX: number, clientY: number) => {
			const container = containerRef.current;
			if (!container) return null;
			const rect = container.getBoundingClientRect();
			const x = clientX - rect.left;
			const y = clientY - rect.top;
			const gx = x - ROW_HEADER_WIDTH + scrollRef.current.x;
			const gy = y - COL_HEADER_HEIGHT + scrollRef.current.y;
			const findIndex = (offsets: number[], target: number, count: number) => {
				let lo = 0;
				let hi = offsets.length - 1;
				while (lo < hi) {
					const mid = Math.ceil((lo + hi) / 2);
					if ((offsets[mid] ?? 0) <= target) lo = mid;
					else hi = mid - 1;
				}
				return Math.max(1, Math.min(lo + 1, count));
			};
			const geo = controller.sheetGeometry(controller.selectedSheet());
			const col = findIndex(geo.colOffsets, Math.max(0, gx), geo.cols);
			const row = findIndex(geo.rowOffsets, Math.max(0, gy), geo.rows);
			const zone =
				x < ROW_HEADER_WIDTH && y < COL_HEADER_HEIGHT
					? ("corner" as const)
					: y < COL_HEADER_HEIGHT
						? ("colHeader" as const)
						: x < ROW_HEADER_WIDTH
							? ("rowHeader" as const)
							: ("cell" as const);
			// Header resize grips: within RESIZE_GRIP px of a column/row edge.
			let resizeCol: number | null = null;
			let resizeRow: number | null = null;
			if (zone === "colHeader") {
				for (let c = 1; c <= geo.cols; c++) {
					const edge =
						(geo.colOffsets[c] ?? 0) -
						scrollRef.current.x +
						ROW_HEADER_WIDTH;
					if (Math.abs(x - edge) <= RESIZE_GRIP) {
						resizeCol = c;
						break;
					}
					if (edge > x + RESIZE_GRIP) break;
				}
			}
			if (zone === "rowHeader") {
				for (let r = 1; r <= geo.rows; r++) {
					const edge =
						(geo.rowOffsets[r] ?? 0) -
						scrollRef.current.y +
						COL_HEADER_HEIGHT;
					if (Math.abs(y - edge) <= RESIZE_GRIP) {
						resizeRow = r;
						break;
					}
					if (edge > y + RESIZE_GRIP) break;
				}
			}
			return { x, y, row, col, zone, resizeCol, resizeRow };
		},
		[controller],
	);

	const selectionRange = useCallback((): CellRange => {
		const view = controller.selectedView();
		return {
			startRow: Math.min(view.range[0], view.range[2]),
			startCol: Math.min(view.range[1], view.range[3]),
			endRow: Math.max(view.range[0], view.range[2]),
			endCol: Math.max(view.range[1], view.range[3]),
		};
	}, [controller]);

	const overFillHandle = useCallback(
		(x: number, y: number): boolean => {
			const range = selectionRange();
			const view = controller.selectedView();
			const rect = cellRect(controller, view.sheet, range.endRow, range.endCol, {
				scrollX: scrollRef.current.x,
				scrollY: scrollRef.current.y,
				width: 0,
				height: 0,
			});
			const hx = rect.x + rect.w;
			const hy = rect.y + rect.h;
			return (
				Math.abs(x - hx) <= FILL_HANDLE_SIZE &&
				Math.abs(y - hy) <= FILL_HANDLE_SIZE
			);
		},
		[controller, selectionRange],
	);

	const ensureVisible = useCallback(() => {
		const scroller = scrollerRef.current;
		const container = containerRef.current;
		if (!scroller || !container) return;
		const view = controller.selectedView();
		const geo = controller.sheetGeometry(view.sheet);
		const left = geo.colOffsets[view.column - 1] ?? 0;
		const right = geo.colOffsets[view.column] ?? 0;
		const top = geo.rowOffsets[view.row - 1] ?? 0;
		const bottom = geo.rowOffsets[view.row] ?? 0;
		const viewWidth = container.clientWidth - ROW_HEADER_WIDTH;
		const viewHeight = container.clientHeight - COL_HEADER_HEIGHT;
		if (left < scroller.scrollLeft) scroller.scrollLeft = left;
		else if (right > scroller.scrollLeft + viewWidth) {
			scroller.scrollLeft = right - viewWidth;
		}
		if (top < scroller.scrollTop) scroller.scrollTop = top;
		else if (bottom > scroller.scrollTop + viewHeight) {
			scroller.scrollTop = bottom - viewHeight;
		}
	}, [controller]);

	// Something outside the grid asked to be taken to the selection — a Find
	// hit, or a range clicked in the agent transcript. Never fires on an
	// ordinary selection move; see WorkbookController.reveal.
	useEffect(() => {
		if (revealSeq > 0) ensureVisible();
	}, [ensureVisible, revealSeq]);

	// ── editing ──

	const startEditing = useCallback(
		(row: number, col: number, mode: "replace" | "edit", initial?: string) => {
			const content =
				mode === "edit"
					? controller.cellContent(controller.selectedSheet(), row, col)
					: (initial ?? "");
			editingValueRef.current = content;
			setEditing({ row, col, initial: content, mode });
		},
		[controller, setEditing],
	);

	const commitEdit = useCallback(
		(value: string, move: CommitMove) => {
			if (!editing) return;
			const { row, col } = editing;
			setEditing(null);
			controller.mutate((model) => {
				model.setUserInput(model.getSelectedSheet(), row, col, value);
			});
			controller.view((model) => {
				// Shift+Enter and Shift+Tab move back the way they came, as they
				// do in every spreadsheet. Rows/cols are 1-based, hence the
				// clamp at 1 rather than 0.
				if (move === "down")
					model.setSelectedCell(Math.min(row + 1, MAX_ROW), col);
				else if (move === "up")
					model.setSelectedCell(Math.max(row - 1, 1), col);
				else if (move === "right")
					model.setSelectedCell(row, Math.min(col + 1, MAX_COLUMN));
				else if (move === "left")
					model.setSelectedCell(row, Math.max(col - 1, 1));
				else model.setSelectedCell(row, col);
			});
			ensureVisible();
			containerRef.current?.focus();
		},
		[controller, editing, ensureVisible, setEditing],
	);

	const cancelEdit = useCallback(() => {
		setEditing(null);
		containerRef.current?.focus();
	}, [setEditing]);

	// ── pointer ──

	const onPointerDown = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			if (event.button === 2) return; // context menu handled separately
			setMenu(null);
			const hit = locate(event.clientX, event.clientY);
			if (!hit) return;
			if (editing) commitEdit(editingValueRef.current, "none");
			containerRef.current?.focus();
			event.currentTarget.setPointerCapture(event.pointerId);

			if (hit.zone === "colHeader" && hit.resizeCol !== null) {
				dragRef.current = {
					kind: "colResize",
					index: hit.resizeCol,
					startPos: event.clientX,
					startSize: controller.model.getColumnWidth(
						controller.selectedSheet(),
						hit.resizeCol,
					),
				};
				return;
			}
			if (hit.zone === "rowHeader" && hit.resizeRow !== null) {
				dragRef.current = {
					kind: "rowResize",
					index: hit.resizeRow,
					startPos: event.clientY,
					startSize: controller.model.getRowHeight(
						controller.selectedSheet(),
						hit.resizeRow,
					),
				};
				return;
			}
			if (hit.zone === "corner") {
				controller.view((model) => {
					model.setSelectedCell(1, 1);
					model.setSelectedRange(1, 1, geometry.rows, geometry.cols);
				});
				return;
			}
			if (hit.zone === "colHeader") {
				controller.view((model) => {
					model.setSelectedCell(1, hit.col);
					model.setSelectedRange(1, hit.col, geometry.rows, hit.col);
				});
				return;
			}
			if (hit.zone === "rowHeader") {
				controller.view((model) => {
					model.setSelectedCell(hit.row, 1);
					model.setSelectedRange(hit.row, 1, hit.row, geometry.cols);
				});
				return;
			}
			if (overFillHandle(hit.x, hit.y)) {
				dragRef.current = {
					kind: "fill",
					fillTarget: null,
					source: selectionRange(),
				};
				return;
			}
			if (event.shiftKey) {
				controller.view((model) => model.onAreaSelecting(hit.row, hit.col));
			} else {
				controller.view((model) => model.setSelectedCell(hit.row, hit.col));
			}
			dragRef.current = { kind: "select" };
		},
		[
			commitEdit,
			controller,
			editing,
			geometry.cols,
			geometry.rows,
			locate,
			overFillHandle,
			selectionRange,
		],
	);

	const onPointerMove = useCallback(
		(event: React.PointerEvent<HTMLDivElement>) => {
			const hit = locate(event.clientX, event.clientY);
			if (!hit) return;
			const drag = dragRef.current;
			if (!drag) {
				const next =
					hit.zone === "colHeader" && hit.resizeCol !== null
						? "col-resize"
						: hit.zone === "rowHeader" && hit.resizeRow !== null
							? "row-resize"
							: hit.zone === "cell" && overFillHandle(hit.x, hit.y)
								? "crosshair"
								: "cell";
				if (next !== cursor) setCursor(next);
				return;
			}
			if (drag.kind === "select") {
				controller.view((model) => model.onAreaSelecting(hit.row, hit.col));
				return;
			}
			if (drag.kind === "fill" && drag.source) {
				const source = drag.source;
				// Fill along the dominant axis from the original selection.
				const target: CellRange =
					hit.row > source.endRow
						? { ...source, endRow: hit.row }
						: hit.col > source.endCol
							? { ...source, endCol: hit.col }
							: source;
				drag.fillTarget = target;
				controller.view((model) =>
					model.setSelectedRange(
						target.startRow,
						target.startCol,
						target.endRow,
						target.endCol,
					),
				);
				return;
			}
			// Resizes only preview during the drag (a guide line); the single
			// engine mutation happens on pointerup so undo stays one step.
			if (drag.kind === "colResize" && drag.index !== undefined) {
				const delta = event.clientX - (drag.startPos ?? 0);
				drag.previewSize = Math.max(20, (drag.startSize ?? 0) + delta);
				const geo = controller.sheetGeometry(controller.selectedSheet());
				const left =
					(geo.colOffsets[drag.index - 1] ?? 0) -
					scrollRef.current.x +
					ROW_HEADER_WIDTH;
				setResizeGuide({ axis: "col", pos: left + drag.previewSize });
				return;
			}
			if (drag.kind === "rowResize" && drag.index !== undefined) {
				const delta = event.clientY - (drag.startPos ?? 0);
				drag.previewSize = Math.max(14, (drag.startSize ?? 0) + delta);
				const geo = controller.sheetGeometry(controller.selectedSheet());
				const top =
					(geo.rowOffsets[drag.index - 1] ?? 0) -
					scrollRef.current.y +
					COL_HEADER_HEIGHT;
				setResizeGuide({ axis: "row", pos: top + drag.previewSize });
			}
		},
		[controller, cursor, locate, overFillHandle],
	);

	const onPointerUp = useCallback(() => {
		const drag = dragRef.current;
		dragRef.current = null;
		setResizeGuide(null);
		if (!drag) return;
		if (drag.kind === "fill" && drag.fillTarget && drag.source) {
			const source = drag.source;
			const target = drag.fillTarget;
			controller.mutate((model) => {
				const sheet = model.getSelectedSheet();
				if (target.endRow > source.endRow) {
					model.autoFillRows(controller.area(sheet, source), target.endRow);
				} else if (target.endCol > source.endCol) {
					model.autoFillColumns(
						controller.area(sheet, source),
						target.endCol,
					);
				}
			});
		}
		if (drag.kind === "colResize" && drag.index !== undefined && drag.previewSize) {
			const { index, previewSize } = drag;
			controller.mutate((model) =>
				model.setColumnsWidth(
					model.getSelectedSheet(),
					index,
					index,
					previewSize,
				),
			);
		}
		if (drag.kind === "rowResize" && drag.index !== undefined && drag.previewSize) {
			const { index, previewSize } = drag;
			controller.mutate((model) =>
				model.setRowsHeight(
					model.getSelectedSheet(),
					index,
					index,
					previewSize,
				),
			);
		}
	}, [controller]);

	const onDoubleClick = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			const hit = locate(event.clientX, event.clientY);
			if (hit?.zone === "cell") startEditing(hit.row, hit.col, "edit");
		},
		[locate, startEditing],
	);

	const onContextMenu = useCallback(
		(event: React.MouseEvent<HTMLDivElement>) => {
			event.preventDefault();
			const hit = locate(event.clientX, event.clientY);
			if (!hit) return;
			if (hit.zone === "colHeader") {
				setMenu({ x: hit.x, y: hit.y, kind: "col", index: hit.col });
			} else if (hit.zone === "rowHeader") {
				setMenu({ x: hit.x, y: hit.y, kind: "row", index: hit.row });
			}
		},
		[locate],
	);

	// ── clipboard ──

	const copySelection = useCallback(
		(cut: boolean) => {
			const clip = controller.model.copyToClipboard();
			clipboardRef.current = {
				csv: clip.csv,
				data: clip.data,
				range: clip.range,
				sheet: controller.selectedSheet(),
				cut,
			};
			void navigator.clipboard.writeText(clip.csv).catch(() => {
				// Clipboard write can fail without permissions; internal
				// copy/paste still works.
			});
		},
		[controller],
	);

	const paste = useCallback(async () => {
		let text = "";
		try {
			text = await navigator.clipboard.readText();
		} catch {
			// No clipboard read permission — fall back to the internal buffer.
			text = clipboardRef.current?.csv ?? "";
		}
		const internal = clipboardRef.current;
		const view = controller.selectedView();
		if (internal && internal.csv === text) {
			controller.mutate((model) => {
				model.pasteFromClipboard(
					internal.sheet,
					internal.range,
					internal.data,
					internal.cut,
				);
			});
			if (internal.cut) clipboardRef.current = null;
		} else if (text) {
			controller.mutate((model) => {
				model.pasteCsvText(
					{
						sheet: view.sheet,
						row: view.row,
						column: view.column,
						width: 1,
						height: 1,
					},
					text,
				);
			});
		}
	}, [controller]);

	// ── keyboard ──

	const onKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (editing) return; // the editor input handles its own keys
			const { key } = event;
			const mod = event.ctrlKey || event.metaKey;
			const view = controller.selectedView();

			if (key.startsWith("Arrow")) {
				event.preventDefault();
				controller.view((model) => {
					if (event.shiftKey) model.onExpandSelectedRange(key);
					else if (mod) model.onNavigateToEdgeInDirection(key);
					else if (key === "ArrowDown") model.onArrowDown();
					else if (key === "ArrowUp") model.onArrowUp();
					else if (key === "ArrowLeft") model.onArrowLeft();
					else if (key === "ArrowRight") model.onArrowRight();
				});
				ensureVisible();
				return;
			}
			if (key === "Tab") {
				event.preventDefault();
				const col = view.column + (event.shiftKey ? -1 : 1);
				controller.view((model) =>
					model.setSelectedCell(
						view.row,
						Math.max(1, Math.min(col, MAX_COLUMN)),
					),
				);
				ensureVisible();
				return;
			}
			if (key === "Enter") {
				event.preventDefault();
				startEditing(view.row, view.column, "edit");
				return;
			}
			if (key === "F2") {
				event.preventDefault();
				startEditing(view.row, view.column, "edit");
				return;
			}
			if (key === "Delete" || key === "Backspace") {
				event.preventDefault();
				const range = selectionRange();
				controller.mutate((model) =>
					model.rangeClearContents(
						model.getSelectedSheet(),
						range.startRow,
						range.startCol,
						range.endRow,
						range.endCol,
					),
				);
				return;
			}
			if (key === "PageDown" || key === "PageUp") {
				event.preventDefault();
				controller.view((model) => {
					if (key === "PageDown") model.onPageDown();
					else model.onPageUp();
				});
				ensureVisible();
				return;
			}
			if (key === "Home") {
				event.preventDefault();
				controller.view((model) =>
					model.setSelectedCell(mod ? 1 : view.row, 1),
				);
				ensureVisible();
				return;
			}
			if (mod && (key === "z" || key === "Z")) {
				event.preventDefault();
				controller.mutate((model) => {
					if (event.shiftKey) model.redo();
					else model.undo();
				});
				return;
			}
			if (mod && key === "y") {
				event.preventDefault();
				controller.mutate((model) => model.redo());
				return;
			}
			if (mod && key === "a") {
				event.preventDefault();
				controller.view((model) => {
					model.setSelectedCell(1, 1);
					model.setSelectedRange(1, 1, geometry.rows, geometry.cols);
				});
				return;
			}
			if (mod && key === "c") {
				copySelection(false);
				return;
			}
			if (mod && key === "x") {
				copySelection(true);
				return;
			}
			if (mod && key === "v") {
				void paste();
				return;
			}
			if (mod && (key === "b" || key === "i" || key === "u")) {
				event.preventDefault();
				const path = key === "b" ? "font.b" : key === "i" ? "font.i" : "font.u";
				const range = selectionRange();
				const current = controller.cellStyle(view.sheet, view.row, view.column);
				const value =
					key === "b"
						? current.font.b
						: key === "i"
							? current.font.i
							: current.font.u;
				controller.mutate((model) =>
					model.updateRangeStyle(
						controller.area(view.sheet, range),
						path,
						value ? "false" : "true",
					),
				);
				return;
			}
			// Any printable character starts a replace-edit.
			if (!mod && key.length === 1) {
				event.preventDefault();
				startEditing(view.row, view.column, "replace", key);
			}
		},
		[
			controller,
			copySelection,
			editing,
			ensureVisible,
			geometry.cols,
			geometry.rows,
			paste,
			selectionRange,
			startEditing,
		],
	);

	// ── row/col menu actions ──

	const menuActions = useMemo(() => {
		if (!menu) return [];
		if (menu.kind === "col") {
			return [
				{
					label: "Insert column left",
					run: () =>
						controller.mutate((m) =>
							m.insertColumns(m.getSelectedSheet(), menu.index, 1),
						),
				},
				{
					label: "Insert column right",
					run: () =>
						controller.mutate((m) =>
							m.insertColumns(m.getSelectedSheet(), menu.index + 1, 1),
						),
				},
				{
					label: "Delete column",
					run: () =>
						controller.mutate((m) =>
							m.deleteColumns(m.getSelectedSheet(), menu.index, 1),
						),
				},
			];
		}
		if (menu.kind === "row") {
			return [
				{
					label: "Insert row above",
					run: () =>
						controller.mutate((m) =>
							m.insertRows(m.getSelectedSheet(), menu.index, 1),
						),
				},
				{
					label: "Insert row below",
					run: () =>
						controller.mutate((m) =>
							m.insertRows(m.getSelectedSheet(), menu.index + 1, 1),
						),
				},
				{
					label: "Delete row",
					run: () =>
						controller.mutate((m) =>
							m.deleteRows(m.getSelectedSheet(), menu.index, 1),
						),
				},
			];
		}
		return [];
	}, [controller, menu]);

	const totalWidth = (geometry.colOffsets[geometry.cols] ?? 0) + ROW_HEADER_WIDTH;
	const totalHeight = (geometry.rowOffsets[geometry.rows] ?? 0) + COL_HEADER_HEIGHT;

	const editorRect = editing
		? cellRect(controller, sheet, editing.row, editing.col, {
				scrollX: scrollRef.current.x,
				scrollY: scrollRef.current.y,
				width: 0,
				height: 0,
			})
		: null;

	return (
		<div
			ref={containerRef}
			role="grid"
			aria-label="Spreadsheet"
			className="relative h-full w-full overflow-hidden outline-none"
			tabIndex={0}
			onKeyDown={onKeyDown}
			data-testid="sheet-grid"
		>
			<canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
			<div
				ref={scrollerRef}
				className="absolute inset-0 overflow-auto"
				style={{ cursor }}
				onScroll={onScroll}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onDoubleClick={onDoubleClick}
				onContextMenu={onContextMenu}
			>
				<div style={{ width: totalWidth, height: totalHeight }} />
			</div>
			{editing && editorRect ? (
				<CellEditor
					key={`${editing.row}:${editing.col}:${editing.mode}`}
					rect={editorRect}
					initial={editing.initial}
					onValueChange={(value) => {
						editingValueRef.current = value;
					}}
					onCommit={commitEdit}
					onCancel={cancelEdit}
				/>
			) : null}
			{resizeGuide ? (
				<div
					className="pointer-events-none absolute z-[var(--z-grid-overlay)] bg-[var(--sheet-selection)]"
					style={
						resizeGuide.axis === "col"
							? { left: resizeGuide.pos, top: 0, bottom: 0, width: 1 }
							: { top: resizeGuide.pos, left: 0, right: 0, height: 1 }
					}
				/>
			) : null}
			{menu ? (
				<div
					className="absolute z-[var(--z-dropdown)] min-w-44 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
					style={{ left: menu.x, top: menu.y }}
				>
					{menuActions.map((action) => (
						<button
							key={action.label}
							type="button"
							className="block w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
							onClick={() => {
								action.run();
								setMenu(null);
							}}
						>
							{action.label}
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

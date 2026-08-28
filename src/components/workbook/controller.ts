import type {
	Area,
	CellStyle,
	Color,
	Model,
	SelectedView,
	WorksheetProperties,
} from "./ironcalc";
import type { CellRange, CellRef } from "@/lib/a1";
import { cellCount, formatCell, parseCell } from "@/lib/a1";

/**
 * Engine cell types, on Excel's TYPE() numbering. The wasm typings return a
 * bare `number` and export no enum, so these values are pinned by
 * cell-stats.test.ts against the vendored build rather than assumed.
 */
export enum CellType {
	Number = 1,
	Text = 2,
	Logical = 4,
	Error = 16,
}

/** One computed-value change observed across a mutation (the delta echo). */
export interface CellChange {
	sheet: number;
	cell: string;
	old: string;
	new: string;
}

export interface AgentHighlight {
	id: string;
	sheet: number;
	range: CellRange;
	note?: string;
}

export interface AgentStatus {
	phase: "idle" | "working" | "viewing" | "editing";
	detail?: string;
	sheet?: number;
	range?: CellRange;
}

interface CellPulse {
	sheet: number;
	row: number;
	col: number;
	until: number;
	kind: "agent" | "recalc";
}

export type MutationResult =
	| { ok: true; changes: CellChange[] }
	| { ok: false; error: string };

// Columns scanned when probing a sheet's used range. Data beyond column 256 is
// not expected from this UI; revisit when imports can carry wider sheets.
const USED_RANGE_COL_SCAN = 256;
// Snapshot ceiling for delta echoes — beyond this we skip diffing (mutations
// still apply; the echo just reports the target range only).
const SNAPSHOT_CELL_CAP = 50_000;
const PULSE_MS = 900;

interface SheetGeometry {
	/** x offset of each column's left edge, index 0 = column 1, length cols+1. */
	colOffsets: number[];
	/** y offset of each row's top edge, index 0 = row 1, length rows+1. */
	rowOffsets: number[];
	rows: number;
	cols: number;
}

/**
 * The single owner of the in-browser IronCalc model. Every read and write from
 * React, keyboard handlers, and agent tools goes through here so that change
 * notification, dirty tracking (autosave), geometry caching, and the delta
 * echo happen in exactly one place. Subscribe via `useSyncExternalStore` on
 * `subscribe`/`getVersion`.
 */
export class WorkbookController {
	readonly model: Model;

	private version = 0;
	private contentVersion = 0;
	private revealSeq = 0;
	private listeners = new Set<() => void>();
	private dirtyListeners = new Set<() => void>();
	private mutationListeners = new Set<
		(changes: CellChange[], author: "user" | "agent") => void
	>();
	private geometry = new Map<number, SheetGeometry>();
	private minExtent = new Map<number, { rows: number; cols: number }>();

	highlights: AgentHighlight[] = [];
	agentStatus: AgentStatus = { phase: "idle" };
	private pulses: CellPulse[] = [];
	private highlightSeq = 0;

	constructor(model: Model) {
		this.model = model;
	}

	// ── subscription ──

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	getVersion = (): number => this.version;

	/**
	 * Bumps on content mutations only, where `version` also counts selection
	 * moves. Find memoises its match scan on this: keying on `version` would
	 * re-scan the sheet on every arrow key, which is the whole cost of the
	 * feature paid for nothing.
	 */
	getContentVersion = (): number => this.contentVersion;

	getRevealSeq = (): number => this.revealSeq;

	/**
	 * Ask the grid to scroll the current selection into view.
	 *
	 * Deliberately explicit rather than "scroll whenever the selection moves":
	 * the agent moves the selection constantly, and a viewport that chases it
	 * would yank the sheet out from under a user who is reading elsewhere. Only
	 * a gesture that *means* "take me there" — Find, or clicking a range in the
	 * transcript — calls this.
	 */
	reveal(): void {
		this.revealSeq += 1;
		this.notify();
	}

	/** Fires on content mutations only (not view changes) — drives autosave. */
	onDirty(listener: () => void): () => void {
		this.dirtyListeners.add(listener);
		return () => this.dirtyListeners.delete(listener);
	}

	/**
	 * Fires after every successful content mutation with its delta echo and the
	 * acting principal (the pulse kind doubles as authorship: agent tools pass
	 * "agent", everything else — keyboard, toolbar, undo — is the user). Feeds
	 * the chat's user-edit log.
	 */
	onMutation(
		listener: (changes: CellChange[], author: "user" | "agent") => void,
	): () => void {
		this.mutationListeners.add(listener);
		return () => this.mutationListeners.delete(listener);
	}

	private notify() {
		this.version += 1;
		for (const listener of this.listeners) listener();
	}

	// ── mutations ──

	/**
	 * Run a content mutation. Returns the delta echo: every cell whose
	 * *computed* value changed (including recalc ripple), diffed over the
	 * sheet's used range. Geometry caches are invalidated.
	 */
	mutate(
		fn: (model: Model) => void,
		pulse: "agent" | "recalc" = "recalc",
	): MutationResult {
		const sheet = this.model.getSelectedSheet();
		const before = this.snapshot(sheet);
		this.contentVersion += 1;
		try {
			fn(this.model);
		} catch (error) {
			// The engine throws before applying, but a multi-step mutation may
			// have partially applied — refresh the UI either way.
			this.invalidate();
			this.notify();
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
		this.invalidate();
		const changes = this.diffSnapshot(sheet, before);
		this.pulseChanges(changes, pulse);
		this.notify();
		for (const listener of this.dirtyListeners) listener();
		const author = pulse === "agent" ? "agent" : "user";
		for (const listener of this.mutationListeners) listener(changes, author);
		return { ok: true, changes };
	}

	/** Run a view-only change (selection, scroll anchor) — no autosave. */
	view(fn: (model: Model) => void): void {
		try {
			fn(this.model);
		} catch {
			// view ops on stale coordinates are harmless — ignore
		}
		this.notify();
	}

	serialize(): Uint8Array {
		return this.model.toBytes();
	}

	// ── reads ──

	sheets(): WorksheetProperties[] {
		return this.model.getWorksheetsProperties();
	}

	selectedSheet(): number {
		return this.model.getSelectedSheet();
	}

	selectedView(): SelectedView {
		return this.model.getSelectedView();
	}

	cellContent(sheet: number, row: number, col: number): string {
		return this.model.getCellContent(sheet, row, col);
	}

	formattedValue(sheet: number, row: number, col: number): string {
		return this.model.getFormattedCellValue(sheet, row, col);
	}

	/**
	 * The engine's cell type, on Excel's TYPE() numbering (verified against the
	 * pinned build in cell-stats.test.ts, since the wasm typings expose this as
	 * a bare `number` with no enum).
	 *
	 * This is the only trustworthy way to ask "is this cell actually a number?".
	 * Do not infer it from the formatted string: IronCalc stores "(1234)" and
	 * "€1.000,12" as TEXT, and both survive a naive numeric regex as bogus
	 * values.
	 */
	cellType(sheet: number, row: number, col: number): CellType {
		const type = this.model.getCellType(sheet, row, col);
		return type === 1 || type === 2 || type === 4 || type === 16
			? type
			: CellType.Text;
	}

	cellStyle(sheet: number, row: number, col: number): CellStyle {
		// getCellStyle grew conditional-formatting extras (icon, data bar,
		// rating) we don't render yet; unwrap to the plain style.
		return this.model.getCellStyle(sheet, row, col).style;
	}

	/** Theme-aware color resolution: "" means "no color set". */
	resolveColor(color: Color): string {
		return this.model.resolveColor(color);
	}

	/** Bounding box of non-empty cells, or null for an empty sheet. */
	usedRange(sheet: number): CellRange | null {
		let maxRow = 0;
		let maxCol = 0;
		for (let col = 1; col <= USED_RANGE_COL_SCAN; col++) {
			const rows = this.model.getRowsWithData(sheet, col);
			if (rows.length === 0) continue;
			maxCol = col;
			for (const row of rows) {
				if (row > maxRow) maxRow = row;
			}
		}
		if (maxRow === 0) return null;
		return { startRow: 1, startCol: 1, endRow: maxRow, endCol: maxCol };
	}

	/**
	 * Every non-empty cell on a sheet, row-major (the order Find walks).
	 *
	 * Driven by the engine's per-column data index rather than a scan of the
	 * used range: a sheet with 40 rows in column A and one cell in column Z has
	 * a used range of 1040 cells but only 41 filled ones, and Find must not pay
	 * a wasm call for the other 999.
	 */
	filledCells(sheet: number): CellRef[] {
		const refs: CellRef[] = [];
		for (let col = 1; col <= USED_RANGE_COL_SCAN; col++) {
			for (const row of this.model.getRowsWithData(sheet, col)) {
				refs.push({ row, col });
			}
		}
		refs.sort((a, b) => a.row - b.row || a.col - b.col);
		return refs;
	}

	// ── delta echo ──

	private snapshot(sheet: number): Map<number, string> | null {
		const used = this.usedRange(sheet);
		if (!used) return new Map();
		if (cellCount(used) > SNAPSHOT_CELL_CAP) return null;
		const values = new Map<number, string>();
		for (let col = 1; col <= used.endCol; col++) {
			const rows = this.model.getRowsWithData(sheet, col);
			for (const row of rows) {
				const value = this.model.getFormattedCellValue(sheet, row, col);
				if (value !== "") values.set(row * 32768 + col, value);
			}
		}
		return values;
	}

	private diffSnapshot(
		sheet: number,
		before: Map<number, string> | null,
	): CellChange[] {
		if (before === null) return [];
		const after = this.snapshot(sheet);
		if (after === null) return [];
		const changes: CellChange[] = [];
		const keys = new Set([...before.keys(), ...after.keys()]);
		for (const key of keys) {
			const oldValue = before.get(key) ?? "";
			const newValue = after.get(key) ?? "";
			if (oldValue === newValue) continue;
			const row = Math.floor(key / 32768);
			const col = key % 32768;
			changes.push({
				sheet,
				cell: formatCell({ row, col }),
				old: oldValue,
				new: newValue,
			});
			if (changes.length >= 500) break;
		}
		return changes;
	}

	// ── presence (agent overlays) ──

	setAgentStatus(status: AgentStatus): void {
		this.agentStatus = status;
		this.notify();
	}

	addHighlight(highlight: Omit<AgentHighlight, "id">): string {
		this.highlightSeq += 1;
		const id = `hl-${this.highlightSeq}`;
		this.highlights = [...this.highlights, { ...highlight, id }];
		this.notify();
		return id;
	}

	removeHighlight(id: string): void {
		this.highlights = this.highlights.filter((h) => h.id !== id);
		this.notify();
	}

	clearHighlights(): void {
		if (this.highlights.length === 0) return;
		this.highlights = [];
		this.notify();
	}

	pulseChanges(changes: CellChange[], kind: "agent" | "recalc"): void {
		if (changes.length === 0) return;
		const until = performance.now() + PULSE_MS;
		for (const change of changes.slice(0, 200)) {
			const ref = parseCell(change.cell);
			if (ref) {
				this.pulses.push({
					sheet: change.sheet,
					row: ref.row,
					col: ref.col,
					until,
					kind,
				});
			}
		}
		this.notify();
	}

	/** Live pulses; expired entries are pruned on read. */
	activePulses(now: number): CellPulse[] {
		if (this.pulses.length > 0 && this.pulses[0] && this.pulses[0].until < now) {
			this.pulses = this.pulses.filter((p) => p.until >= now);
		}
		return this.pulses.filter((p) => p.until >= now);
	}

	// ── geometry ──

	private invalidate() {
		this.geometry.clear();
	}

	/** Ensure the sheet's virtual extent covers at least rows × cols. */
	extendExtent(sheet: number, rows: number, cols: number): void {
		const current = this.minExtent.get(sheet) ?? { rows: 0, cols: 0 };
		if (rows <= current.rows && cols <= current.cols) return;
		this.minExtent.set(sheet, {
			rows: Math.max(rows, current.rows),
			cols: Math.max(cols, current.cols),
		});
		this.geometry.delete(sheet);
		this.notify();
	}

	sheetGeometry(sheet: number): SheetGeometry {
		const cached = this.geometry.get(sheet);
		if (cached) return cached;
		const used = this.usedRange(sheet);
		const min = this.minExtent.get(sheet) ?? { rows: 0, cols: 0 };
		const rows = Math.max((used?.endRow ?? 0) + 100, 200, min.rows);
		const cols = Math.max((used?.endCol ?? 0) + 10, 30, min.cols);
		const colOffsets: number[] = Array.from({ length: cols + 1 }, () => 0);
		colOffsets[0] = 0;
		for (let col = 1; col <= cols; col++) {
			const prev = colOffsets[col - 1] ?? 0;
			colOffsets[col] = prev + this.model.getColumnWidth(sheet, col);
		}
		const rowOffsets: number[] = Array.from({ length: rows + 1 }, () => 0);
		rowOffsets[0] = 0;
		for (let row = 1; row <= rows; row++) {
			const prev = rowOffsets[row - 1] ?? 0;
			rowOffsets[row] = prev + this.model.getRowHeight(sheet, row);
		}
		const geometry: SheetGeometry = { colOffsets, rowOffsets, rows, cols };
		this.geometry.set(sheet, geometry);
		return geometry;
	}

	area(sheet: number, range: CellRange): Area {
		return {
			sheet,
			row: range.startRow,
			column: range.startCol,
			width: range.endCol - range.startCol + 1,
			height: range.endRow - range.startRow + 1,
		};
	}
}

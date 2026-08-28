"use client";

import { useSyncExternalStore } from "react";

import { cellCount, formatCell, formatRange } from "@/lib/a1";

import { selectionStats } from "./cell-stats";
import type { WorkbookController } from "./controller";

// Above this, per-cell engine calls would stall the UI on every selection
// change. Hitting it says so rather than making the stats silently vanish.
const STATS_CELL_CAP = 10000;

/**
 * Bottom strip: selection reference + quick stats, spreadsheet-style.
 *
 * The arithmetic lives in cell-stats.ts and is deliberately conservative — it
 * skips any cell whose value can't be recovered exactly rather than guessing.
 */
export function StatusBar({ controller }: { controller: WorkbookController }) {
	useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);

	const view = controller.selectedView();
	const range = {
		startRow: Math.min(view.range[0], view.range[2]),
		startCol: Math.min(view.range[1], view.range[3]),
		endRow: Math.max(view.range[0], view.range[2]),
		endCol: Math.max(view.range[1], view.range[3]),
	};

	const size = cellCount(range);
	const overCap = size > STATS_CELL_CAP;
	const stats =
		size > 1 && !overCap ? selectionStats(controller, view.sheet, range) : null;

	const format = (n: number) =>
		// Undefined locale = the reader's own. This is chrome, not cell content.
		new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

	const activeCell = formatCell({ row: view.row, col: view.column });
	const activeValue = controller.formattedValue(view.sheet, view.row, view.column);

	return (
		<div
			className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-background px-3 text-[11px] text-muted-foreground"
			// Spreadsheet users read the sum by glancing; a screen reader user
			// needs it announced when the selection settles. Polite, so it never
			// interrupts navigation.
			//
			// This is the app's ONE live region for the sheet, deliberately: the
			// grid is a canvas, so moving the cursor is otherwise completely
			// silent, and a second region on the grid would race this one.
			aria-live="polite"
			aria-atomic="true"
		>
			{/* Sighted users read the active cell's value off the grid itself;
			    a screen reader has nothing to read, so the announcement leads
			    with it and the visible strip stays uncluttered. */}
			<span className="sr-only">
				{activeCell}
				{activeValue === "" ? ", empty" : `, ${activeValue}`}
				{size > 1 ? `, ${formatRange(range)} selected` : ""}
			</span>
			<span className="font-mono" aria-hidden>
				{formatRange(range)}
			</span>

			{overCap ? (
				<span>Selection too large for stats</span>
			) : stats && stats.filled > 0 ? (
				<>
					{stats.numeric > 0 ? (
						<>
							<span>Sum {format(stats.sum)}</span>
							<span>Avg {format(stats.sum / stats.numeric)}</span>
							{/* Min and Max are what a spreadsheet user glances
							    for next after Sum — and both fall out of the
							    same scan Sum already pays for. */}
							{stats.min !== null ? (
								<span className="hidden sm:inline">
									Min {format(stats.min)}
								</span>
							) : null}
							{stats.max !== null ? (
								<span className="hidden sm:inline">
									Max {format(stats.max)}
								</span>
							) : null}
						</>
					) : null}
					{/* Count reports every non-empty cell, so a text-only
					    selection still answers "how many?" rather than showing
					    nothing at all. */}
					<span>Count {stats.filled}</span>
					{stats.skipped > 0 ? (
						<span title="Dates and values the engine can't express as a plain number are left out of Sum and Avg.">
							{stats.skipped} not counted
						</span>
					) : null}
				</>
			) : null}
		</div>
	);
}

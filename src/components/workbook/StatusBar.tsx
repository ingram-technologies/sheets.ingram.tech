"use client";

import { useSyncExternalStore } from "react";

import { cellCount, formatRange } from "@/lib/a1";

import type { WorkbookController } from "./controller";

const STATS_CELL_CAP = 10000;

/**
 * Bottom strip: selection reference + quick stats (sum/avg/count of numeric
 * cells in the selection), spreadsheet-style.
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

	let stats: { sum: number; count: number; filled: number } | null = null;
	if (cellCount(range) > 1 && cellCount(range) <= STATS_CELL_CAP) {
		let sum = 0;
		let count = 0;
		let filled = 0;
		for (let row = range.startRow; row <= range.endRow; row++) {
			for (let col = range.startCol; col <= range.endCol; col++) {
				const value = controller.formattedValue(view.sheet, row, col);
				if (value === "") continue;
				filled += 1;
				const numeric = Number(value.replace(/[^0-9.eE+-]/g, ""));
				if (value.match(/\d/) && Number.isFinite(numeric)) {
					sum += numeric;
					count += 1;
				}
			}
		}
		if (filled > 0) stats = { sum, count, filled };
	}

	const format = (n: number) =>
		new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);

	return (
		<div className="flex h-6 shrink-0 items-center gap-4 border-t border-border bg-background px-3 text-[11px] text-muted-foreground">
			<span className="font-mono">{formatRange(range)}</span>
			{stats && stats.count > 0 ? (
				<>
					<span>Sum {format(stats.sum)}</span>
					<span>Avg {format(stats.sum / stats.count)}</span>
					<span>Count {stats.filled}</span>
				</>
			) : null}
		</div>
	);
}

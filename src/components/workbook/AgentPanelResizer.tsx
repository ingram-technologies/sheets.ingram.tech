"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * The drag handle between the grid and the agent panel.
 *
 * The panel was a fixed `w-80`, which forced a bad trade in both directions:
 * an agent explaining a table wrapped every line at ~40 characters, and a user
 * working a wide sheet couldn't claw the width back without hiding the panel
 * outright. The two principals share the viewport as well as the document, so
 * the split is the user's to set — and it persists, because re-dragging it
 * every session is the same annoyance charged repeatedly.
 */

const STORAGE_KEY = "sheets:agent-panel-width";
const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 320;
/** Grid width below which dragging stops, so the sheet can't be squeezed out. */
const MIN_GRID_WIDTH = 320;
const KEYBOARD_STEP = 24;

function clamp(width: number): number {
	return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

/**
 * The persisted panel width. Starts at the default on both server and first
 * client render and adopts the stored value in an effect — reading
 * localStorage during render would hydrate-mismatch.
 */
export function useAgentPanelWidth(): [number, (width: number) => void] {
	const [width, setWidth] = useState(DEFAULT_WIDTH);

	useEffect(() => {
		const stored = Number(window.localStorage.getItem(STORAGE_KEY));
		if (Number.isFinite(stored) && stored > 0) setWidth(clamp(stored));
	}, []);

	const commit = useCallback((next: number) => {
		const value = clamp(next);
		setWidth(value);
		window.localStorage.setItem(STORAGE_KEY, String(value));
	}, []);

	return [width, commit];
}

export function AgentPanelResizer({
	width,
	onWidth,
}: {
	width: number;
	onWidth: (width: number) => void;
}) {
	const [dragging, setDragging] = useState(false);

	// Bound to the window, not the handle: a fast drag outruns a 4px target,
	// and pointer capture alone doesn't stop the grid from seeing the move.
	useEffect(() => {
		if (!dragging) return;
		const onMove = (event: PointerEvent) => {
			const fromRight = window.innerWidth - event.clientX;
			onWidth(Math.min(fromRight, window.innerWidth - MIN_GRID_WIDTH));
		};
		const stop = () => setDragging(false);
		window.addEventListener("pointermove", onMove);
		window.addEventListener("pointerup", stop);
		window.addEventListener("pointercancel", stop);
		// The grid's cursor would otherwise flicker back to `cell` mid-drag.
		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", stop);
			window.removeEventListener("pointercancel", stop);
			document.body.style.cursor = "";
			document.body.style.userSelect = "";
		};
	}, [dragging, onWidth]);

	return (
		<div
			role="separator"
			aria-label="Agent panel width"
			aria-orientation="vertical"
			// A separator that only responds to a pointer is a control half the
			// users can't reach; arrows and Home/End drive the same value.
			aria-valuenow={width}
			aria-valuemin={MIN_WIDTH}
			aria-valuemax={MAX_WIDTH}
			tabIndex={0}
			// 8px of grab area over a 1px visual seam: the seam is the design,
			// the target is the WCAG 2.2 minimum made usable.
			className="group relative z-[var(--z-sticky)] -mr-1 hidden w-2 shrink-0 cursor-col-resize touch-none md:block"
			onPointerDown={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDoubleClick={() => onWidth(DEFAULT_WIDTH)}
			onKeyDown={(event) => {
				const step =
					event.key === "ArrowLeft"
						? KEYBOARD_STEP
						: event.key === "ArrowRight"
							? -KEYBOARD_STEP
							: 0;
				if (step !== 0) {
					event.preventDefault();
					onWidth(width + step);
					return;
				}
				if (event.key === "Home") {
					event.preventDefault();
					onWidth(MAX_WIDTH);
				} else if (event.key === "End") {
					event.preventDefault();
					onWidth(MIN_WIDTH);
				}
			}}
		>
			<span
				aria-hidden
				className={
					"pointer-events-none absolute inset-y-0 right-1 w-px transition-colors " +
					(dragging
						? "bg-primary"
						: "bg-transparent group-hover:bg-primary/50")
				}
			/>
		</div>
	);
}

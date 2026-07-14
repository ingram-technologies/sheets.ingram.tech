"use client";

import { useEffect, useRef } from "react";

/**
 * The in-grid cell editor: a floating input positioned exactly over the cell
 * being edited. Commits via Enter (move down), Tab (move right), or blur;
 * Escape cancels. Formula text is edited raw — the engine parses on commit.
 */
export function CellEditor({
	rect,
	initial,
	onValueChange,
	onCommit,
	onCancel,
}: {
	rect: { x: number; y: number; w: number; h: number };
	initial: string;
	onValueChange: (value: string) => void;
	onCommit: (value: string, move: "down" | "right" | "none") => void;
	onCancel: () => void;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		input.focus();
		// Caret at the end (replace mode starts with the typed character).
		input.setSelectionRange(input.value.length, input.value.length);
	}, []);

	return (
		<input
			ref={inputRef}
			defaultValue={initial}
			spellCheck={false}
			autoComplete="off"
			className="absolute z-10 border-2 border-[var(--sheet-selection)] bg-[var(--sheet-cell-bg)] px-1 font-[family-name:var(--sheet-font)] text-[13px] text-[var(--sheet-cell-fg)] outline-none"
			style={{
				left: rect.x,
				top: rect.y,
				minWidth: rect.w,
				height: rect.h,
			}}
			onChange={(event) => onValueChange(event.target.value)}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					onCommit(event.currentTarget.value, "down");
				} else if (event.key === "Tab") {
					event.preventDefault();
					onCommit(event.currentTarget.value, "right");
				} else if (event.key === "Escape") {
					event.preventDefault();
					onCancel();
				}
				event.stopPropagation();
			}}
			onBlur={(event) => onCommit(event.currentTarget.value, "none")}
		/>
	);
}

"use client";

import { useEffect, useRef, useState } from "react";

/** Where the selection lands after a commit. */
export type CommitMove = "down" | "up" | "right" | "left" | "none";

/**
 * The in-grid cell editor: a floating input positioned exactly over the cell
 * being edited. Commits via Enter (down), Shift+Enter (up), Tab (right),
 * Shift+Tab (left), or blur; Escape cancels. Formula text is edited raw — the
 * engine parses on commit.
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
	onCommit: (value: string, move: CommitMove) => void;
	onCancel: () => void;
}) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	// True while an IME is mid-composition (CJK, and any keyboard using dead
	// keys or candidate windows). Enter belongs to the IME then — it accepts
	// the candidate, and committing the cell would truncate the word.
	const [composing, setComposing] = useState(false);

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
			aria-label="Cell value"
			className="absolute z-[var(--z-cell-editor)] border-2 border-[var(--sheet-selection)] bg-[var(--sheet-cell-bg)] px-1 font-[family-name:var(--sheet-font)] text-[13px] text-[var(--sheet-cell-fg)] outline-none"
			style={{
				left: rect.x,
				top: rect.y,
				minWidth: rect.w,
				// Long entries used to grow the input straight off the viewport
				// edge; cap it and scroll the text inside instead.
				maxWidth: `calc(100vw - ${rect.x}px - 1rem)`,
				height: rect.h,
			}}
			onChange={(event) => onValueChange(event.target.value)}
			onCompositionStart={() => setComposing(true)}
			onCompositionEnd={() => setComposing(false)}
			onKeyDown={(event) => {
				// `event.isComposing` covers browsers that fire keydown during
				// composition; the state flag covers the compositionend/keydown
				// ordering gap in others.
				if (composing || event.nativeEvent.isComposing) {
					event.stopPropagation();
					return;
				}
				if (event.key === "Enter") {
					event.preventDefault();
					onCommit(event.currentTarget.value, event.shiftKey ? "up" : "down");
				} else if (event.key === "Tab") {
					event.preventDefault();
					onCommit(
						event.currentTarget.value,
						event.shiftKey ? "left" : "right",
					);
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

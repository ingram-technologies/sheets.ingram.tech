"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { formatCell, MAX_COLUMN, MAX_ROW, parseCell } from "@/lib/a1";

import type { WorkbookController } from "./controller";

/**
 * Name box (A1 reference, editable to jump) + formula input mirroring the
 * active cell. The agent's "ghost typing" also lands here: while the agent is
 * editing, the bar shows the formula being written.
 */
export function FormulaBar({ controller }: { controller: WorkbookController }) {
	useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);

	const view = controller.selectedView();
	const content = controller.cellContent(view.sheet, view.row, view.column);
	const cellName = formatCell({ row: view.row, col: view.column });

	const [draft, setDraft] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const lastCell = useRef(cellName);

	// Selection moved → drop any in-progress draft.
	useEffect(() => {
		if (lastCell.current !== cellName) {
			lastCell.current = cellName;
			setDraft(null);
		}
	}, [cellName]);

	const agentEditing = controller.agentStatus.phase === "editing";
	const shown =
		draft ?? (agentEditing ? (controller.agentStatus.detail ?? content) : content);

	return (
		<div className="flex h-9 shrink-0 items-center gap-1 border-b border-border bg-background px-2">
			<NameBox controller={controller} cellName={cellName} />
			<div className="mx-1 h-5 w-px bg-border" aria-hidden />
			<span className="select-none font-mono text-xs text-muted-foreground italic">
				fx
			</span>
			<input
				ref={inputRef}
				value={shown}
				spellCheck={false}
				autoComplete="off"
				placeholder=""
				aria-label="Formula"
				data-agent-editing={agentEditing || undefined}
				className="h-7 flex-1 rounded-sm bg-transparent px-2 font-[family-name:var(--sheet-font)] text-[13px] outline-none focus:ring-1 focus:ring-ring data-[agent-editing]:text-[var(--sheet-agent)]"
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && draft !== null) {
						event.preventDefault();
						const value = draft;
						setDraft(null);
						controller.mutate((model) =>
							model.setUserInput(
								view.sheet,
								view.row,
								view.column,
								value,
							),
						);
						inputRef.current?.blur();
					} else if (event.key === "Escape") {
						setDraft(null);
						inputRef.current?.blur();
					}
				}}
				onBlur={() => {
					// Blur without Enter keeps the draft visible but uncommitted
					// only briefly — match spreadsheet convention and discard.
					setDraft(null);
				}}
			/>
		</div>
	);
}

function NameBox({
	controller,
	cellName,
}: {
	controller: WorkbookController;
	cellName: string;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	return (
		<input
			value={draft ?? cellName}
			spellCheck={false}
			autoComplete="off"
			aria-label="Cell reference"
			className="h-7 w-20 rounded-sm bg-transparent px-2 text-center font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
			onFocus={(event) => {
				setDraft(event.currentTarget.value);
				event.currentTarget.select();
			}}
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					const target = parseCell(event.currentTarget.value);
					if (target && target.row <= MAX_ROW && target.col <= MAX_COLUMN) {
						controller.view((model) =>
							model.setSelectedCell(target.row, target.col),
						);
					}
					setDraft(null);
					event.currentTarget.blur();
				} else if (event.key === "Escape") {
					setDraft(null);
					event.currentTarget.blur();
				}
			}}
			onBlur={() => setDraft(null)}
		/>
	);
}

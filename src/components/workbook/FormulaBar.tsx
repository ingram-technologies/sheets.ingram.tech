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
	// Escape and selection-changes must abandon the draft; blur must commit it.
	// This flag is how blur tells those apart.
	const abandon = useRef(false);

	// Selection moved → drop any in-progress draft.
	useEffect(() => {
		if (lastCell.current !== cellName) {
			lastCell.current = cellName;
			abandon.current = true;
			setDraft(null);
		}
	}, [cellName]);

	const agentEditing = controller.agentStatus.phase === "editing";
	const shown =
		draft ?? (agentEditing ? (controller.agentStatus.detail ?? content) : content);

	const commit = (value: string) => {
		setDraft(null);
		controller.mutate((model) =>
			model.setUserInput(view.sheet, view.row, view.column, value),
		);
	};

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
				aria-label="Formula"
				// While the agent ghost-types, the value shown is the agent's, not
				// the cell's. Leaving it editable let a keystroke silently fork
				// into a draft mid-write; the two principals share one model, so
				// the bar yields to whoever is acting.
				readOnly={agentEditing}
				data-agent-editing={agentEditing || undefined}
				// Formulas are code: mono keeps parens and refs scannable, and the
				// proportional sheet font made `=SUM(B2:B10)` needlessly hard to
				// read.
				className="h-7 flex-1 rounded-sm bg-transparent px-2 font-mono text-[13px] outline-none focus:ring-1 focus:ring-ring data-[agent-editing]:text-agent"
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && draft !== null) {
						event.preventDefault();
						abandon.current = true; // commit here, not again on blur
						commit(draft);
						inputRef.current?.blur();
					} else if (event.key === "Escape") {
						abandon.current = true;
						setDraft(null);
						inputRef.current?.blur();
					}
				}}
				onBlur={() => {
					// Commit on blur, like the cell editor and like Excel. This
					// used to discard the draft, so the same gesture kept your
					// typing in a cell and threw it away in the formula bar.
					const pending = draft;
					const abandoned = abandon.current;
					abandon.current = false;
					if (!abandoned && pending !== null && pending !== content) {
						commit(pending);
					} else {
						setDraft(null);
					}
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
	const [invalid, setInvalid] = useState(false);

	return (
		<input
			value={draft ?? cellName}
			spellCheck={false}
			autoComplete="off"
			aria-label="Cell reference"
			aria-invalid={invalid || undefined}
			title={cellName}
			// Was w-20 and centred, which clipped "Sheet1!AA100" from both ends.
			className="h-7 w-24 shrink-0 rounded-sm bg-transparent px-2 text-center font-mono text-xs outline-none focus:ring-1 focus:ring-ring aria-invalid:ring-1 aria-invalid:ring-destructive-ink"
			onFocus={(event) => {
				setDraft(event.currentTarget.value);
				event.currentTarget.select();
			}}
			onChange={(event) => {
				setInvalid(false);
				setDraft(event.target.value);
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					const target = parseCell(event.currentTarget.value);
					if (target && target.row <= MAX_ROW && target.col <= MAX_COLUMN) {
						controller.view((model) =>
							model.setSelectedCell(target.row, target.col),
						);
						setDraft(null);
						event.currentTarget.blur();
					} else {
						// Was a silent revert — the box just snapped back with no
						// hint that the reference was rejected.
						setInvalid(true);
					}
				} else if (event.key === "Escape") {
					setInvalid(false);
					setDraft(null);
					event.currentTarget.blur();
				}
			}}
			onBlur={() => {
				setInvalid(false);
				setDraft(null);
			}}
		/>
	);
}

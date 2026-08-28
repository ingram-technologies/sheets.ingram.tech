"use client";

import {
	CaseSensitiveIcon,
	ChevronDownIcon,
	ChevronUpIcon,
	FunctionSquareIcon,
	SquareDashedIcon,
	XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { WorkbookController } from "./controller";
import type { FindOptions } from "./find";
import { DEFAULT_FIND_OPTIONS, findMatches, nextMatch, replaceTargets } from "./find";

/**
 * Find & replace, floating over the top-right of the grid.
 *
 * Floating rather than another full-width chrome bar on purpose: the chrome is
 * already four strips deep, and inserting a fifth would shift every row under
 * the user's cursor the moment they press Ctrl+F — moving the thing they were
 * about to look at.
 */
export function FindBar({
	controller,
	mode,
	onClose,
}: {
	controller: WorkbookController;
	/** "replace" opens with the replace row already expanded. */
	mode: "find" | "replace";
	onClose: () => void;
}) {
	useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);
	const contentVersion = useSyncExternalStore(
		controller.subscribe,
		controller.getContentVersion,
		controller.getContentVersion,
	);

	const [query, setQuery] = useState("");
	const [replacement, setReplacement] = useState("");
	const [options, setOptions] = useState<FindOptions>(DEFAULT_FIND_OPTIONS);
	const [showReplace, setShowReplace] = useState(mode === "replace");
	const [index, setIndex] = useState(0);
	/** What the last replace actually did — never a guess, never a toast. */
	const [report, setReport] = useState<string | null>(null);
	const queryRef = useRef<HTMLInputElement | null>(null);

	const sheet = controller.selectedSheet();

	// Re-opening with Ctrl+H while the bar is already up must expand replace.
	useEffect(() => {
		if (mode === "replace") setShowReplace(true);
		queryRef.current?.focus();
		queryRef.current?.select();
	}, [mode]);

	const matches = useMemo(() => {
		// Read, not just listed as a dep: `contentVersion` is what makes this
		// re-scan after an edit, and keying on `version` instead would re-scan
		// on every arrow key — the whole cost of Find, paid for nothing.
		void contentVersion;
		return findMatches(controller, sheet, query, options);
	}, [controller, sheet, query, options, contentVersion]);

	const go = (target: number) => {
		const ref = matches[target];
		if (!ref) return;
		setIndex(target);
		controller.view((model) => {
			model.setSelectedCell(ref.row, ref.col);
			model.setSelectedRange(ref.row, ref.col, ref.row, ref.col);
		});
		controller.reveal();
	};

	const step = (direction: 1 | -1) => {
		if (matches.length === 0) return;
		const view = controller.selectedView();
		go(nextMatch(matches, { row: view.row, col: view.column }, direction));
	};

	const replaceOne = () => {
		const ref = matches[index];
		if (!ref) return;
		const plan = replaceTargets(
			controller,
			sheet,
			[ref],
			query,
			replacement,
			options,
		);
		const edit = plan.edits[0];
		if (!edit) {
			setReport("Skipped — that match is a formula result, not its source.");
			return;
		}
		controller.mutate((model) =>
			model.setUserInput(sheet, edit.ref.row, edit.ref.col, edit.next),
		);
		setReport(null);
		// The rewritten cell may no longer match, so the list shifts under us;
		// stepping from the current selection lands on the next real hit.
		step(1);
	};

	const replaceAll = () => {
		const plan = replaceTargets(
			controller,
			sheet,
			matches,
			query,
			replacement,
			options,
		);
		if (plan.edits.length === 0) {
			setReport(
				plan.skipped > 0
					? `Nothing replaced — all ${plan.skipped} matches are formula results.`
					: "Nothing to replace.",
			);
			return;
		}
		// One mutate, so the whole replace is a single Ctrl+Z.
		const result = controller.mutate((model) => {
			for (const edit of plan.edits) {
				model.setUserInput(sheet, edit.ref.row, edit.ref.col, edit.next);
			}
		});
		if (!result.ok) {
			setReport(result.error);
			return;
		}
		const replaced = `Replaced ${plan.edits.length} ${plan.edits.length === 1 ? "cell" : "cells"}`;
		setReport(
			plan.skipped > 0
				? `${replaced} · ${plan.skipped} skipped (formula results)`
				: `${replaced}. Undo with Ctrl+Z.`,
		);
	};

	const toggle = (key: keyof FindOptions) => {
		setOptions((current) => ({ ...current, [key]: !current[key] }));
		setReport(null);
	};

	const counter =
		query.trim() === ""
			? ""
			: matches.length === 0
				? "No matches"
				: `${Math.min(index + 1, matches.length)} of ${matches.length}`;

	return (
		<div
			role="search"
			aria-label="Find in sheet"
			// Escape is handled by the workbook's window listener, not here: the
			// panel must also close when focus has moved back to the grid.
			className="absolute top-2 right-2 z-[var(--z-sticky)] w-80 max-w-[calc(100%-1rem)] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-lg"
		>
			<div className="flex items-center gap-1">
				<button
					type="button"
					aria-expanded={showReplace}
					aria-label={showReplace ? "Hide replace" : "Show replace"}
					className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
					onClick={() => setShowReplace((open) => !open)}
				>
					<ChevronDownIcon
						className={cn(
							"size-3.5 transition-transform",
							showReplace && "rotate-180",
						)}
					/>
				</button>
				<input
					ref={queryRef}
					value={query}
					spellCheck={false}
					autoComplete="off"
					aria-label="Find"
					placeholder="Find in sheet"
					className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
					onChange={(event) => {
						setQuery(event.target.value);
						setIndex(0);
						setReport(null);
					}}
					onKeyDown={(event) => {
						if (event.key !== "Enter") return;
						event.preventDefault();
						step(event.shiftKey ? -1 : 1);
					}}
				/>
				<span
					className="shrink-0 tabular-nums text-[11px] text-muted-foreground"
					// The count is the answer to "did that find anything?" — a
					// sighted user reads it, everyone else needs it announced.
					aria-live="polite"
					aria-atomic="true"
				>
					{counter}
				</span>
				<IconToggle
					label="Previous match (Shift+Enter)"
					disabled={matches.length === 0}
					onClick={() => step(-1)}
				>
					<ChevronUpIcon className="size-3.5" />
				</IconToggle>
				<IconToggle
					label="Next match (Enter)"
					disabled={matches.length === 0}
					onClick={() => step(1)}
				>
					<ChevronDownIcon className="size-3.5" />
				</IconToggle>
				<IconToggle label="Close find (Esc)" onClick={onClose}>
					<XIcon className="size-3.5" />
				</IconToggle>
			</div>

			{showReplace ? (
				<div className="mt-1.5 flex items-center gap-1 pl-7">
					<input
						value={replacement}
						spellCheck={false}
						autoComplete="off"
						aria-label="Replace with"
						placeholder="Replace with"
						className="h-7 min-w-0 flex-1 rounded-sm border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
						onChange={(event) => {
							setReplacement(event.target.value);
							setReport(null);
						}}
					/>
					<Button
						variant="outline"
						size="sm"
						className="h-7 shrink-0 px-2 text-xs"
						disabled={matches.length === 0}
						onClick={replaceOne}
					>
						Replace
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="h-7 shrink-0 px-2 text-xs"
						disabled={matches.length === 0}
						onClick={replaceAll}
					>
						All
					</Button>
				</div>
			) : null}

			<div className="mt-1.5 flex items-center gap-0.5 pl-7">
				<IconToggle
					label="Match case"
					active={options.matchCase}
					onClick={() => toggle("matchCase")}
				>
					<CaseSensitiveIcon className="size-3.5" />
				</IconToggle>
				<IconToggle
					label="Match entire cell"
					active={options.wholeCell}
					onClick={() => toggle("wholeCell")}
				>
					<SquareDashedIcon className="size-3.5" />
				</IconToggle>
				<IconToggle
					label="Search formulas, not results"
					active={options.inFormulas}
					onClick={() => toggle("inFormulas")}
				>
					<FunctionSquareIcon className="size-3.5" />
				</IconToggle>
				{report ? (
					<p
						className="ml-1 min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
						role="status"
						title={report}
					>
						{report}
					</p>
				) : null}
			</div>
		</div>
	);
}

function IconToggle({
	label,
	active,
	disabled,
	onClick,
	children,
}: {
	label: string;
	active?: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<Tooltip>
			<TooltipTrigger
				render={
					<Button
						variant="ghost"
						size="icon"
						disabled={disabled}
						aria-label={label}
						aria-pressed={active}
						className={cn(
							"size-6 shrink-0",
							active
								? "bg-primary/15 text-primary hover:bg-primary/25 hover:text-primary"
								: "text-muted-foreground",
						)}
						onClick={onClick}
					>
						{children}
					</Button>
				}
			/>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

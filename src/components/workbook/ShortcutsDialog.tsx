"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";

import { useModKeyLabel } from "./mod-key";

/**
 * The keyboard reference.
 *
 * This app is dense and keyboard-first by design, which only pays off if the
 * keys are discoverable — an undocumented shortcut is a shortcut nobody has.
 * Every row here is a binding the grid actually implements; nothing aspirational.
 */

interface Group {
	title: string;
	keys: { combo: string[]; action: string }[];
}

// Chrome renders ⌘ on Apple platforms and Ctrl elsewhere, resolved at render
// time — a hardcoded "Ctrl" is wrong for half the readers.
const MOD = "mod";

const GROUPS: Group[] = [
	{
		title: "Moving",
		keys: [
			{ combo: ["↑", "↓", "←", "→"], action: "Move one cell" },
			{ combo: [MOD, "↑↓←→"], action: "Jump to the edge of the data" },
			{ combo: ["Shift", "↑↓←→"], action: "Extend the selection" },
			{ combo: ["Tab"], action: "Next cell (Shift+Tab for previous)" },
			{ combo: ["Home"], action: "First column of the row" },
			{ combo: ["End"], action: "Last column with data" },
			{ combo: [MOD, "Home"], action: "Cell A1" },
			{ combo: [MOD, "End"], action: "Last cell with data" },
			{ combo: ["PgUp", "PgDn"], action: "Move one screen" },
		],
	},
	{
		title: "Editing",
		keys: [
			{ combo: ["Enter"], action: "Edit the cell, then move down" },
			{ combo: ["F2"], action: "Edit the cell in place" },
			{ combo: ["Esc"], action: "Cancel the edit" },
			{ combo: ["Delete"], action: "Clear the selection's contents" },
			{ combo: [MOD, "Z"], action: "Undo (Shift to redo)" },
			{ combo: [MOD, "C"], action: "Copy (X to cut, V to paste)" },
			{ combo: [MOD, "Shift", "V"], action: "Paste values only" },
			{ combo: [MOD, "A"], action: "Select the whole sheet" },
			{ combo: ["Shift", "F10"], action: "Open the cell menu" },
		],
	},
	{
		title: "Formatting",
		keys: [
			{ combo: [MOD, "B"], action: "Bold" },
			{ combo: [MOD, "I"], action: "Italic" },
			{ combo: [MOD, "U"], action: "Underline" },
		],
	},
	{
		title: "The workbook",
		keys: [
			{ combo: [MOD, "F"], action: "Find in this sheet" },
			{ combo: [MOD, "H"], action: "Find and replace" },
			{ combo: [MOD, "S"], action: "Save now" },
			{ combo: [MOD, "/"], action: "This list" },
		],
	},
];

export function ShortcutsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const modLabel = useModKeyLabel();

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription>
						Standard spreadsheet keys work as you expect them to.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
					{GROUPS.map((group) => (
						<section key={group.title}>
							<h3 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
								{group.title}
							</h3>
							<dl className="space-y-1.5">
								{group.keys.map((key) => (
									<div
										key={key.action}
										className="flex items-baseline justify-between gap-3"
									>
										<dt className="text-sm text-muted-foreground">
											{key.action}
										</dt>
										<dd className="flex shrink-0 items-center gap-1">
											{key.combo.map((part) => (
												<kbd
													key={part}
													className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
												>
													{part === MOD ? modLabel : part}
												</kbd>
											))}
										</dd>
									</div>
								))}
							</dl>
						</section>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}

"use client";

import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/ui/delete-confirm-dialog";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { WorkbookController } from "./controller";

/**
 * Sheet tabs.
 *
 * Dialog state keys off `sheet_id`, not the array index: an index goes stale
 * the moment a sheet is added or removed while a dialog is open, which would
 * rename or delete the wrong sheet.
 */
type Pending = { sheetId: number; name: string };

export function SheetTabs({ controller }: { controller: WorkbookController }) {
	useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);
	const [renaming, setRenaming] = useState<Pending | null>(null);
	const [deleting, setDeleting] = useState<Pending | null>(null);
	const [renameError, setRenameError] = useState<string | null>(null);
	const stripRef = useRef<HTMLDivElement>(null);

	const sheets = controller.sheets();
	const selected = controller.selectedSheet();
	const visible = sheets
		.map((sheet, index) => ({ sheet, index }))
		.filter(({ sheet }) => sheet.state === "visible");

	const select = (index: number) => {
		controller.view((model) => model.setSelectedSheet(index));
	};

	const indexOf = (sheetId: number) =>
		sheets.findIndex((sheet) => sheet.sheet_id === sheetId);

	/**
	 * Roving arrow-key navigation across the tab strip, which the tablist role
	 * promises and users of every other spreadsheet expect. Home/End jump to
	 * the ends.
	 */
	const onKeyDown = (event: React.KeyboardEvent, position: number) => {
		const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
		if (!keys.includes(event.key)) return;
		event.preventDefault();
		const last = visible.length - 1;
		const next =
			event.key === "ArrowRight"
				? Math.min(position + 1, last)
				: event.key === "ArrowLeft"
					? Math.max(position - 1, 0)
					: event.key === "Home"
						? 0
						: last;
		const target = visible[next];
		if (!target) return;
		select(target.index);
		// Keep the newly-selected tab reachable in the scrolling strip.
		stripRef.current
			?.querySelectorAll<HTMLElement>("[role='tab']")
			[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
	};

	const commitRename = () => {
		if (!renaming) return;
		const name = renaming.name.trim();
		const index = indexOf(renaming.sheetId);
		if (index === -1) {
			setRenaming(null);
			return;
		}
		if (!name) {
			setRenameError("A sheet needs a name.");
			return;
		}
		const clash = sheets.some(
			(sheet) =>
				sheet.sheet_id !== renaming.sheetId &&
				sheet.name.toLowerCase() === name.toLowerCase(),
		);
		if (clash) {
			setRenameError(`There's already a sheet called "${name}".`);
			return;
		}
		const result = controller.mutate((model) => model.renameSheet(index, name));
		if (!result.ok) {
			setRenameError(result.error);
			return;
		}
		setRenaming(null);
		setRenameError(null);
	};

	return (
		<div className="flex h-9 shrink-0 items-center gap-1 border-t border-border bg-background px-2">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Add sheet"
				className="size-7 shrink-0 text-muted-foreground"
				onClick={() => {
					controller.mutate((model) => model.newSheet());
					controller.view((model) =>
						model.setSelectedSheet(controller.sheets().length - 1),
					);
				}}
			>
				<PlusIcon className="size-4" />
			</Button>

			<div
				ref={stripRef}
				role="tablist"
				aria-label="Sheets"
				className="flex items-center gap-0.5 overflow-x-auto"
			>
				{visible.map(({ sheet, index }, position) => {
					const isSelected = index === selected;
					return (
						<div
							key={sheet.sheet_id}
							className={cn(
								"flex h-7 shrink-0 items-center rounded-sm text-xs whitespace-nowrap",
								isSelected
									? // Coral underline + tint. `bg-accent` alone was
										// charcoal-on-charcoal (1.35:1) — the selected
										// sheet was essentially unmarked.
										"bg-primary/15 font-medium text-primary shadow-[inset_0_-2px_0_0_var(--primary)]"
									: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
							)}
						>
							<button
								type="button"
								role="tab"
								aria-selected={isSelected}
								// Roving tabindex: the strip is one tab stop, then
								// arrows move within it.
								tabIndex={isSelected ? 0 : -1}
								title={sheet.name}
								className="h-full max-w-40 truncate pr-1 pl-3"
								onClick={() => select(index)}
								onKeyDown={(event) => onKeyDown(event, position)}
								onDoubleClick={() =>
									setRenaming({
										sheetId: sheet.sheet_id,
										name: sheet.name,
									})
								}
							>
								{sheet.name}
							</button>
							{isSelected ? (
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<button
												type="button"
												aria-label={`Sheet ${sheet.name} menu`}
												className="flex h-full items-center rounded-sm pr-1.5 pl-0.5"
											>
												<ChevronDownIcon className="size-3" />
											</button>
										}
									/>
									<DropdownMenuContent align="start" side="top">
										<DropdownMenuItem
											onClick={() =>
												setRenaming({
													sheetId: sheet.sheet_id,
													name: sheet.name,
												})
											}
										>
											Rename
										</DropdownMenuItem>
										<DropdownMenuItem
											variant="destructive"
											disabled={visible.length <= 1}
											onClick={() =>
												setDeleting({
													sheetId: sheet.sheet_id,
													name: sheet.name,
												})
											}
										>
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							) : (
								<span className="pr-2" />
							)}
						</div>
					);
				})}
			</div>

			<Dialog
				open={renaming !== null}
				onOpenChange={(open) => {
					if (!open) {
						setRenaming(null);
						setRenameError(null);
					}
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Rename sheet</DialogTitle>
						<DialogDescription>
							Choose a new name for this sheet.
						</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							commitRename();
						}}
					>
						<Input
							autoFocus
							aria-label="Sheet name"
							aria-invalid={renameError !== null}
							value={renaming?.name ?? ""}
							onChange={(event) => {
								setRenameError(null);
								setRenaming((current) =>
									current
										? { ...current, name: event.target.value }
										: current,
								);
							}}
						/>
						{renameError ? (
							<p
								className="mt-2 text-xs text-destructive-ink"
								role="alert"
							>
								{renameError}
							</p>
						) : null}
						<DialogFooter className="mt-4">
							<Button type="submit" size="sm">
								Rename
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/*
			 * Deleting a sheet destroys every cell on it and was previously a
			 * single click with no confirmation and no undo hint.
			 */}
			{deleting ? (
				<DeleteConfirmDialog
					title="Delete sheet"
					confirmText={deleting.name}
					confirmLabel="Delete sheet"
					description={
						<>
							This deletes <strong>{deleting.name}</strong> and everything
							on it. You can undo this with Ctrl+Z.
						</>
					}
					onClose={() => setDeleting(null)}
					onConfirm={async () => {
						const index = indexOf(deleting.sheetId);
						if (index === -1) return "That sheet no longer exists.";
						const result = controller.mutate((model) =>
							model.deleteSheet(index),
						);
						if (!result.ok) return result.error;
						setDeleting(null);
						return null;
					}}
				/>
			) : null}
		</div>
	);
}

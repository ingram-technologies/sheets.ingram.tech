"use client";

import { ChevronDown, Plus } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
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

export function SheetTabs({ controller }: { controller: WorkbookController }) {
	useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);
	const [renaming, setRenaming] = useState<{ index: number; name: string } | null>(
		null,
	);

	const sheets = controller.sheets();
	const selected = controller.selectedSheet();

	return (
		<div className="flex h-9 shrink-0 items-center gap-1 border-t border-border bg-background px-2">
			<Button
				variant="ghost"
				size="icon"
				aria-label="Add sheet"
				className="size-6 text-muted-foreground"
				onClick={() => {
					controller.mutate((model) => model.newSheet());
					controller.view((model) =>
						model.setSelectedSheet(controller.sheets().length - 1),
					);
				}}
			>
				<Plus className="size-4" />
			</Button>
			<div className="flex items-center gap-0.5 overflow-x-auto">
				{sheets.map((sheet, index) =>
					sheet.state === "visible" ? (
						<div
							key={sheet.sheet_id}
							className={cn(
								"flex h-7 items-center rounded-sm text-xs whitespace-nowrap",
								index === selected
									? "bg-accent font-medium text-accent-foreground"
									: "text-muted-foreground hover:bg-accent/50",
							)}
						>
							<button
								type="button"
								className="h-full pr-1 pl-3 outline-none"
								onClick={() =>
									controller.view((model) =>
										model.setSelectedSheet(index),
									)
								}
								onDoubleClick={() =>
									setRenaming({ index, name: sheet.name })
								}
							>
								{sheet.name}
							</button>
							{index === selected ? (
								<DropdownMenu>
									<DropdownMenuTrigger
										render={
											<button
												type="button"
												aria-label={`Sheet ${sheet.name} menu`}
												className="flex h-full items-center pr-1.5 pl-0.5 outline-none"
											>
												<ChevronDown className="size-3" />
											</button>
										}
									/>
									<DropdownMenuContent align="start" side="top">
										<DropdownMenuItem
											onClick={() =>
												setRenaming({ index, name: sheet.name })
											}
										>
											Rename
										</DropdownMenuItem>
										<DropdownMenuItem
											variant="destructive"
											disabled={sheets.length <= 1}
											onClick={() => {
												controller.mutate((model) =>
													model.deleteSheet(index),
												);
											}}
										>
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							) : (
								<span className="pr-2" />
							)}
						</div>
					) : null,
				)}
			</div>

			<Dialog
				open={renaming !== null}
				onOpenChange={(open) => {
					if (!open) setRenaming(null);
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
							if (!renaming) return;
							const name = renaming.name.trim();
							if (name) {
								controller.mutate((model) =>
									model.renameSheet(renaming.index, name),
								);
							}
							setRenaming(null);
						}}
					>
						<Input
							autoFocus
							value={renaming?.name ?? ""}
							onChange={(event) =>
								setRenaming((current) =>
									current
										? { ...current, name: event.target.value }
										: current,
								)
							}
						/>
						<DialogFooter className="mt-4">
							<Button type="submit" size="sm">
								Rename
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}

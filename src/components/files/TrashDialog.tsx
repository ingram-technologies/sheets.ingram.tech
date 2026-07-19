"use client";

import {
	FileSpreadsheetIcon,
	Loader2Icon,
	RotateCcwIcon,
	Trash2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

// Validate the API's own response, and stay client-safe — importing the schema
// from lib/workbooks would pull the Postgres pool into the browser bundle.
const trashItem = z.object({
	id: z.string(),
	name: z.string(),
	deletedAt: z.string().nullable(),
});
const trashResponse = z.object({ workbooks: z.array(trashItem) });

type TrashItem = z.infer<typeof trashItem>;

/**
 * Recently-deleted workbooks. Deletion is a soft-delete (`deleted_at`), so this
 * is the recovery surface: restore a workbook to the live list, or erase it for
 * good. `onChange` re-fetches the parent list after either.
 */
export function TrashDialog({
	open,
	onOpenChange,
	onChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onChange: () => void;
}) {
	const [items, setItems] = useState<TrashItem[] | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setItems(null);
		setConfirmId(null);
		void (async () => {
			try {
				const response = await fetch("/api/workbooks/trash");
				const parsed = trashResponse.safeParse(await response.json());
				if (!cancelled) setItems(parsed.success ? parsed.data.workbooks : []);
			} catch {
				if (!cancelled) setItems([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open]);

	const restore = async (workbook: TrashItem) => {
		setBusyId(workbook.id);
		try {
			const response = await fetch(`/api/workbooks/${workbook.id}/restore`, {
				method: "POST",
			});
			if (!response.ok) throw new Error();
			setItems((current) => current?.filter((w) => w.id !== workbook.id) ?? null);
			onChange();
			toast.success(`Restored “${workbook.name}”`);
		} catch {
			toast.error("Couldn't restore the workbook");
		} finally {
			setBusyId(null);
		}
	};

	const erase = async (workbook: TrashItem) => {
		setBusyId(workbook.id);
		try {
			const response = await fetch(
				`/api/workbooks/${workbook.id}?permanent=true`,
				{ method: "DELETE" },
			);
			if (!response.ok) throw new Error();
			setItems((current) => current?.filter((w) => w.id !== workbook.id) ?? null);
			toast.success("Deleted permanently");
		} catch {
			toast.error("Couldn't delete the workbook");
		} finally {
			setBusyId(null);
			setConfirmId(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg gap-4">
				<DialogHeader>
					<DialogTitle>Trash</DialogTitle>
					<DialogDescription>
						Deleted workbooks are kept here. Restore one, or erase it for
						good — that can&apos;t be undone.
					</DialogDescription>
				</DialogHeader>

				{items === null ? (
					<div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
						<Loader2Icon className="size-4 animate-spin" />
						Loading…
					</div>
				) : items.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-10 text-center">
						<Trash2Icon className="size-6 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">Trash is empty.</p>
					</div>
				) : (
					<ul className="-mx-1 max-h-[min(60vh,26rem)] space-y-0.5 overflow-y-auto">
						{items.map((workbook) => {
							const confirming = confirmId === workbook.id;
							const busy = busyId === workbook.id;
							return (
								<li
									key={workbook.id}
									className="flex items-center gap-3 rounded-md px-1 py-2"
								>
									<FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">
											{workbook.name}
										</span>
										<span className="block text-xs text-muted-foreground">
											Deleted {formatWhen(workbook.deletedAt)}
										</span>
									</span>
									{confirming ? (
										<span className="flex items-center gap-1">
											<Button
												variant="destructive"
												size="sm"
												className="h-7 px-2 text-xs"
												disabled={busy}
												onClick={() => void erase(workbook)}
											>
												{busy ? (
													<Loader2Icon className="size-3.5 animate-spin" />
												) : null}
												Delete forever
											</Button>
											<Button
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs"
												disabled={busy}
												onClick={() => setConfirmId(null)}
											>
												Cancel
											</Button>
										</span>
									) : (
										<span className="flex items-center gap-1">
											<Button
												variant="outline"
												size="sm"
												className="h-7 px-2 text-xs"
												disabled={busy}
												onClick={() => void restore(workbook)}
											>
												<RotateCcwIcon className="size-3.5" />
												Restore
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="size-7 text-muted-foreground hover:text-destructive-ink"
												aria-label={`Delete “${workbook.name}” permanently`}
												disabled={busy}
												onClick={() =>
													setConfirmId(workbook.id)
												}
											>
												<Trash2Icon className="size-4" />
											</Button>
										</span>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}

function formatWhen(iso: string | null): string {
	if (!iso) return "recently";
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
}

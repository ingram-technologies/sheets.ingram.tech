"use client";

import { FileSpreadsheet, MoreHorizontal, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toaster";
import { UserMenu } from "@/components/auth/UserMenu";
import { ensureIronCalc, Model } from "@/components/workbook/ironcalc";
import type { WorkbookMeta } from "@/lib/workbooks";

export function FileManager({ workbooks }: { workbooks: WorkbookMeta[] }) {
	const router = useRouter();
	const [creating, setCreating] = useState(false);
	const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
	const [deleting, setDeleting] = useState<WorkbookMeta | null>(null);

	const createWorkbook = async () => {
		setCreating(true);
		try {
			// The engine runs in the browser: build an empty workbook here and
			// upload its bytes — the server only stores blobs.
			await ensureIronCalc();
			const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
			const model = new Model("workbook", "en", timezone, "en");
			const bytes = model.toBytes();
			model.free();
			const response = await fetch("/api/workbooks", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: "Untitled workbook",
					bytes: bytesToBase64(bytes),
				}),
			});
			if (!response.ok) throw new Error(`create failed (${response.status})`);
			const meta: unknown = await response.json();
			if (
				typeof meta === "object" &&
				meta !== null &&
				"id" in meta &&
				typeof meta.id === "string"
			) {
				router.push(`/w/${meta.id}`);
			}
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to create workbook",
			);
			setCreating(false);
		}
	};

	const rename = async () => {
		if (!renaming) return;
		const name = renaming.name.trim();
		setRenaming(null);
		if (!name) return;
		await fetch(`/api/workbooks/${renaming.id}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name }),
		});
		router.refresh();
	};

	const remove = async (): Promise<string | null> => {
		if (!deleting) return null;
		const response = await fetch(`/api/workbooks/${deleting.id}`, {
			method: "DELETE",
		});
		if (!response.ok) return "Failed to delete workbook";
		setDeleting(null);
		toast.success("Workbook deleted");
		router.refresh();
		return null;
	};

	return (
		<main className="mx-auto w-full max-w-4xl px-6 py-10">
			<PageHeader
				icon={FileSpreadsheet}
				title="Sheets"
				description="AI-native spreadsheets — shared workspace"
				className="mb-4 border-b-0 px-0 sm:px-0"
				actions={
					<>
						<Button
							onClick={() => void createWorkbook()}
							disabled={creating}
						>
							<Plus className="size-4" />
							{creating ? "Creating…" : "New workbook"}
						</Button>
						<UserMenu />
					</>
				}
			/>

			{workbooks.length === 0 ? (
				<EmptyState
					icon={FileSpreadsheet}
					title="No workbooks yet"
					description="Create your first workbook and ask the agent to build something in it."
					action={
						<Button
							onClick={() => void createWorkbook()}
							disabled={creating}
						>
							<Plus className="size-4" />
							New workbook
						</Button>
					}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead className="w-44">Last modified</TableHead>
							<TableHead className="w-24 text-right">Size</TableHead>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{workbooks.map((workbook) => (
							<TableRow key={workbook.id} className="group">
								<TableCell className="p-0">
									<Link
										href={`/w/${workbook.id}`}
										className="flex items-center gap-2.5 px-2 py-3 font-medium"
									>
										<FileSpreadsheet className="size-4 text-muted-foreground" />
										{workbook.name}
									</Link>
								</TableCell>
								<TableCell
									className="text-muted-foreground text-xs"
									suppressHydrationWarning
								>
									{new Date(workbook.updatedAt).toLocaleString(
										undefined,
										{
											dateStyle: "medium",
											timeStyle: "short",
										},
									)}
								</TableCell>
								<TableCell className="text-right text-muted-foreground text-xs">
									{formatSize(workbook.size)}
								</TableCell>
								<TableCell>
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon"
													aria-label={`Actions for ${workbook.name}`}
													className="size-7 text-muted-foreground opacity-0 group-hover:opacity-100 data-popup-open:opacity-100"
												>
													<MoreHorizontal className="size-4" />
												</Button>
											}
										/>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												onClick={() =>
													setRenaming({
														id: workbook.id,
														name: workbook.name,
													})
												}
											>
												Rename
											</DropdownMenuItem>
											<DropdownMenuItem
												variant="destructive"
												onClick={() => setDeleting(workbook)}
											>
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}

			<Dialog
				open={renaming !== null}
				onOpenChange={(open) => {
					if (!open) setRenaming(null);
				}}
			>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Rename workbook</DialogTitle>
						<DialogDescription>Choose a new name.</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void rename();
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

			{deleting ? (
				<DeleteConfirmDialog
					title="Delete workbook"
					confirmText={deleting.name}
					confirmLabel="Delete workbook"
					description={
						<>
							This permanently deletes <strong>{deleting.name}</strong>{" "}
							and its contents for everyone in the workspace.
						</>
					}
					onClose={() => setDeleting(null)}
					onConfirm={remove}
				/>
			) : null}
		</main>
	);
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

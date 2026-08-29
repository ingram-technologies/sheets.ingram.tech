"use client";

import {
	FileSpreadsheetIcon,
	MoreHorizontalIcon,
	PlusIcon,
	Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";

import { SheetsMark } from "@/components/brand/sheets-mark";
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
import { ConnectClaudeCode } from "@/components/files/ConnectClaudeCode";
import { ImportCsv } from "@/components/files/ImportCsv";
import { OpenFromGoogle } from "@/components/files/OpenFromGoogle";
import { TrashDialog } from "@/components/files/TrashDialog";
import { SetupWizard } from "@/components/inference/SetupWizard";
import { ensureIronCalc, Model } from "@/components/workbook/ironcalc";
import { bytesToBase64 } from "@/lib/bytes";
import { isInferenceConfigured, isInferenceDeferred } from "@/lib/inference-prefs";
import type { WorkbookMeta } from "@/lib/workbooks";

const subscribeNever = () => () => {};

export function FileManager({ workbooks }: { workbooks: WorkbookMeta[] }) {
	const router = useRouter();
	const [creating, setCreating] = useState(false);
	const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
	const [trashOpen, setTrashOpen] = useState(false);
	// First-run nudge: the setup opens by itself unless inference is already
	// configured or the user chose to look around first. Both live in
	// localStorage, which the server cannot read — so the nudge is an external
	// store (false on the server, the real answer on the client's first render)
	// rather than an effect that opened the dialog a frame late. Once the user
	// opens or closes it themselves that choice wins.
	const [inferenceChoice, setInferenceChoice] = useState<boolean | null>(null);
	const shouldNudge = useSyncExternalStore(
		subscribeNever,
		() => !isInferenceConfigured() && !isInferenceDeferred(),
		() => false,
	);
	const inferenceOpen = inferenceChoice ?? shouldNudge;
	const setInferenceOpen = setInferenceChoice;

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

	// Delete is a soft-delete (recoverable from Trash), so a single deliberate
	// menu click is enough — no type-to-confirm gate for a reversible action.
	const moveToTrash = async (workbook: WorkbookMeta) => {
		const response = await fetch(`/api/workbooks/${workbook.id}`, {
			method: "DELETE",
		});
		if (!response.ok) {
			toast.error("Couldn't delete the workbook");
			return;
		}
		toast.success(`Moved “${workbook.name}” to trash`);
		router.refresh();
	};

	return (
		<main className="mx-auto w-full max-w-4xl px-6 py-10">
			<SetupWizard open={inferenceOpen} onOpenChange={setInferenceOpen} />
			<PageHeader
				icon={SheetsMark}
				iconClassName="bg-primary/10 text-primary"
				title="Ingram Sheets"
				description="A spreadsheet agents operate directly"
				className="mb-6 border-b-0 px-0 sm:px-0"
				actions={
					<>
						<Button
							variant="ghost"
							size="icon"
							title="Trash"
							aria-label="Trash"
							className="size-9 text-muted-foreground"
							onClick={() => setTrashOpen(true)}
						>
							<Trash2Icon className="size-4" />
						</Button>
						<ConnectClaudeCode />
						<ImportCsv />
						<OpenFromGoogle />
						<Button
							onClick={() => void createWorkbook()}
							disabled={creating}
						>
							<PlusIcon className="size-4" />
							{creating ? "Creating…" : "New workbook"}
						</Button>
						<UserMenu
							onOpenInferenceSettings={() => setInferenceOpen(true)}
						/>
					</>
				}
			/>

			{workbooks.length === 0 ? (
				<EmptyState
					icon={FileSpreadsheetIcon}
					title="No workbooks yet"
					description="Create your first workbook and ask the agent to build something in it."
					action={
						<Button
							onClick={() => void createWorkbook()}
							disabled={creating}
						>
							<PlusIcon className="size-4" />
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
										title={workbook.name}
										className="flex items-center gap-2.5 rounded-sm px-2 py-3 font-medium"
									>
										<FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
										<span className="truncate">
											{workbook.name}
										</span>
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
													<MoreHorizontalIcon className="size-4" />
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
												onClick={() =>
													void moveToTrash(workbook)
												}
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

			<TrashDialog
				open={trashOpen}
				onOpenChange={setTrashOpen}
				onChange={() => router.refresh()}
			/>

			<footer className="mt-16 flex flex-col items-center gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
				<p>
					© {new Date().getFullYear()}{" "}
					<a
						href="https://ingram.tech"
						target="_blank"
						rel="noreferrer"
						className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
					>
						Ingram Technologies
					</a>
					{" · "}
					<a
						href="https://cloud.ingram.tech"
						target="_blank"
						rel="noreferrer"
						className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
					>
						Hosted in EU – Runs on Ingram Cloud
					</a>
				</p>
				<a
					href="https://ingram.tech/privacy"
					target="_blank"
					rel="noreferrer"
					className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
				>
					Privacy
				</a>
			</footer>
		</main>
	);
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

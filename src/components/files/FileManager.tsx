"use client";

import {
	ArrowDownIcon,
	ArrowUpIcon,
	ChevronDownIcon,
	FileSpreadsheetIcon,
	FileUpIcon,
	Link2Icon,
	MoreHorizontalIcon,
	MoreVerticalIcon,
	PlusIcon,
	SearchIcon,
	TerminalIcon,
	Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
	DropdownMenuSeparator,
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
import { useCsvImport } from "@/components/files/ImportCsv";
import { OpenFromGoogle } from "@/components/files/OpenFromGoogle";
import { TrashDialog } from "@/components/files/TrashDialog";
import { SetupWizard } from "@/components/inference/SetupWizard";
import { ensureIronCalc, Model } from "@/components/workbook/ironcalc";
import { bytesToBase64 } from "@/lib/bytes";
import { isInferenceConfigured, isInferenceDeferred } from "@/lib/inference-prefs";
import { cn } from "@/lib/utils";
import type { WorkbookMeta } from "@/lib/workbooks";

/** The columns this list can be ordered by. */
type SortKey = "name" | "updatedAt" | "size";

/** Below this the list is short enough to read whole; search would be noise. */
const SEARCH_THRESHOLD = 8;

export function FileManager({ workbooks }: { workbooks: WorkbookMeta[] }) {
	const router = useRouter();
	const [creating, setCreating] = useState(false);
	const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
	const [trashOpen, setTrashOpen] = useState(false);
	const [googleOpen, setGoogleOpen] = useState(false);
	const [connectOpen, setConnectOpen] = useState(false);
	const [inferenceOpen, setInferenceOpen] = useState(false);
	const [query, setQuery] = useState("");
	const searchRef = useRef<HTMLInputElement | null>(null);
	const csv = useCsvImport();
	// Newest first is the right landing order for a list you return to; the
	// server already sorts that way, and this makes it steerable rather than
	// fixed.
	const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({
		key: "updatedAt",
		descending: true,
	});

	const searchable = workbooks.length > SEARCH_THRESHOLD;

	const shown = useMemo(() => {
		const needle = query.trim().toLowerCase();
		const filtered = needle
			? workbooks.filter((book) => book.name.toLowerCase().includes(needle))
			: workbooks;
		const direction = sort.descending ? -1 : 1;
		return [...filtered].sort((a, b) => {
			if (sort.key === "name") {
				// localeCompare, not `<`: "Étude" sorts after "Zebra" by code
				// point and between "Estimate" and "Forecast" by language.
				return a.name.localeCompare(b.name) * direction;
			}
			if (sort.key === "size") return (a.size - b.size) * direction;
			return (
				(new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) *
				direction
			);
		});
	}, [query, sort, workbooks]);

	const reorder = (key: SortKey) =>
		setSort((current) =>
			current.key === key
				? { key, descending: !current.descending }
				: // Text reads best A→Z; dates and sizes read best largest-first.
					{ key, descending: key !== "name" },
		);

	// First-run nudge: open the setup once, unless it's already configured or the
	// user chose to look around first. Deferred to an effect (localStorage read).
	useEffect(() => {
		if (!isInferenceConfigured() && !isInferenceDeferred()) setInferenceOpen(true);
	}, []);

	/**
	 * "/" jumps to the search box — the binding every list-shaped tool has, and
	 * the only way to reach the filter without leaving the keyboard. Ignored
	 * while typing somewhere else, so it never eats a slash in a formula name.
	 */
	useEffect(() => {
		if (!searchable) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) {
				return;
			}
			const target = event.target;
			if (
				target instanceof HTMLElement &&
				(target.isContentEditable ||
					["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
			) {
				return;
			}
			event.preventDefault();
			searchRef.current?.focus();
			searchRef.current?.select();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [searchable]);

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

	/**
	 * Delete is a soft-delete, so a single deliberate menu click is enough —
	 * no type-to-confirm gate for a reversible action. The toast carries the
	 * reversal itself: recovering used to mean knowing that the Trash exists
	 * and finding it, which is a lot to ask of someone who just mis-clicked.
	 */
	const moveToTrash = async (workbook: WorkbookMeta) => {
		const response = await fetch(`/api/workbooks/${workbook.id}`, {
			method: "DELETE",
		});
		if (!response.ok) {
			toast.error("Couldn't delete the workbook");
			return;
		}
		router.refresh();
		toast.success(`Moved “${workbook.name}” to trash`, {
			action: {
				label: "Undo",
				onClick: () => void restore(workbook),
			},
		});
	};

	const restore = async (workbook: WorkbookMeta) => {
		const response = await fetch(`/api/workbooks/${workbook.id}/restore`, {
			method: "POST",
		});
		if (!response.ok) {
			toast.error("Couldn't restore the workbook — look in the trash");
			return;
		}
		router.refresh();
	};

	return (
		// max-w-5xl, not 4xl: this header carries the title and its actions, and
		// at 896px they left the title ~90px — the product's own name read
		// "Ingram Sh…".
		// data-stable-gutter: this list changes height at the `sm` breakpoint
		// (rows gain a meta line, the footer wraps), and without a reserved
		// gutter that height change moves the viewport width and makes the
		// breakpoint flip back and forth across a band of widths. See
		// globals.css.
		<main data-stable-gutter className="mx-auto w-full max-w-5xl px-6 py-10">
			<SetupWizard open={inferenceOpen} onOpenChange={setInferenceOpen} />
			{csv.input}
			<PageHeader
				icon={SheetsMark}
				iconClassName="bg-primary/10 text-primary"
				title="Ingram Sheets"
				description="A spreadsheet agents operate directly"
				className="mb-6 border-b-0 px-0 sm:px-0"
				actions={
					<>
						{/*
						 * The two ways to bring an existing spreadsheet in are
						 * one job, so they are one control. As two outline
						 * buttons they carried the same weight as the primary
						 * action and, with the trash and terminal glyphs beside
						 * them, put six unranked controls in a row that wrapped
						 * onto three lines on a phone.
						 */}
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button variant="outline" disabled={csv.importing}>
										<FileUpIcon className="size-4" />
										{csv.importing ? "Importing…" : "Import"}
										<ChevronDownIcon className="size-3.5 opacity-60" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end" className="min-w-56">
								<DropdownMenuItem onClick={csv.pick}>
									<FileUpIcon className="size-4" />
									CSV or TSV file…
								</DropdownMenuItem>
								<DropdownMenuItem onClick={() => setGoogleOpen(true)}>
									<FileSpreadsheetIcon className="size-4" />
									From Google Sheets…
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						{/* "New workbook" is 180px of label; at 390px it pushed
						    the overflow menu and the avatar onto a third
						    header row. The accessible name never shortens. */}
						<Button
							onClick={() => void createWorkbook()}
							disabled={creating}
							aria-label={creating ? "Creating workbook" : "New workbook"}
						>
							<PlusIcon className="size-4" />
							{creating ? (
								"Creating…"
							) : (
								<>
									<span className="sm:hidden">New</span>
									<span className="hidden sm:inline">
										New workbook
									</span>
								</>
							)}
						</Button>

						{/* Trash and the MCP hand-off are destinations, not
						    primary verbs — labelled here rather than left as
						    two bare glyphs beside the page title. */}
						<DropdownMenu>
							<DropdownMenuTrigger
								render={
									<Button
										variant="ghost"
										size="icon"
										aria-label="More actions"
										className="size-9 text-muted-foreground"
									>
										<MoreVerticalIcon className="size-4" />
									</Button>
								}
							/>
							<DropdownMenuContent align="end" className="min-w-56">
								<DropdownMenuItem onClick={() => setTrashOpen(true)}>
									<Trash2Icon className="size-4" />
									Trash
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={() => setConnectOpen(true)}>
									<TerminalIcon className="size-4" />
									Connect Claude Code
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						<UserMenu
							onOpenInferenceSettings={() => setInferenceOpen(true)}
						/>
					</>
				}
			/>

			{/* Search earns its place from about a dozen workbooks; below that
			    it is noise, so it appears only once the list is long enough to
			    scan for something. */}
			{searchable ? (
				<div className="relative mb-3">
					<SearchIcon
						aria-hidden
						className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						ref={searchRef}
						type="search"
						value={query}
						aria-label="Search workbooks"
						placeholder="Search workbooks"
						className="pr-10 pl-9"
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={(event) => {
							// Escape clears, then leaves — the same gesture the
							// grid and the cell editor use to back out.
							if (event.key !== "Escape") return;
							if (query) setQuery("");
							else event.currentTarget.blur();
						}}
					/>
					{/* The binding is invisible otherwise, and an undiscovered
					    shortcut is a shortcut nobody has. */}
					<kbd
						aria-hidden
						className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:block"
					>
						/
					</kbd>
				</div>
			) : null}

			{workbooks.length === 0 ? (
				<EmptyState
					icon={FileSpreadsheetIcon}
					title="No workbooks yet"
					description="Create your first workbook and ask the agent to build something in it — or bring one you already have."
					action={
						<div className="flex flex-wrap items-center justify-center gap-2">
							<Button
								onClick={() => void createWorkbook()}
								disabled={creating}
							>
								<PlusIcon className="size-4" />
								New workbook
							</Button>
							<Button variant="outline" onClick={csv.pick}>
								<FileUpIcon className="size-4" />
								Import a CSV
							</Button>
							<Button
								variant="outline"
								onClick={() => setGoogleOpen(true)}
							>
								<FileSpreadsheetIcon className="size-4" />
								Open from Google Sheets
							</Button>
						</div>
					}
				/>
			) : shown.length === 0 ? (
				// A filtered-to-nothing list is not an empty account: the way
				// out is clearing the search, not creating a workbook.
				<EmptyState
					icon={SearchIcon}
					title={`No workbook matches “${query.trim()}”`}
					description="Try a shorter search, or check the trash for something you deleted."
					action={
						<div className="flex flex-wrap items-center justify-center gap-2">
							<Button variant="outline" onClick={() => setQuery("")}>
								Clear search
							</Button>
							<Button variant="ghost" onClick={() => setTrashOpen(true)}>
								<Trash2Icon className="size-4" />
								Open trash
							</Button>
						</div>
					}
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<SortHeader
								label="Name"
								sortKey="name"
								sort={sort}
								onSort={reorder}
							/>
							<SortHeader
								label="Last modified"
								sortKey="updatedAt"
								sort={sort}
								onSort={reorder}
								// Below `sm` this fact moves under the name:
								// off-screen columns behind a scrollbar the
								// page gives no hint about are unreachable.
								className="hidden w-44 sm:table-cell"
							/>
							<SortHeader
								label="Size"
								sortKey="size"
								sort={sort}
								onSort={reorder}
								className="hidden w-24 md:table-cell"
								align="right"
							/>
							<TableHead className="w-12" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((workbook) => (
							<WorkbookRow
								key={workbook.id}
								workbook={workbook}
								onRename={() =>
									setRenaming({
										id: workbook.id,
										name: workbook.name,
									})
								}
								onDelete={() => void moveToTrash(workbook)}
							/>
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
							aria-label="Workbook name"
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
			<OpenFromGoogle open={googleOpen} onOpenChange={setGoogleOpen} />
			<ConnectClaudeCode open={connectOpen} onOpenChange={setConnectOpen} />

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

/**
 * One workbook in the list.
 *
 * The whole row opens it. Only the name was a link before, while the row
 * carried a hover tint across its full width — so the two thirds of the row
 * that looked clickable did nothing. The link's `::after` covers the row
 * (hence `relative` on the `<tr>`), which keeps one link per row for a screen
 * reader while giving a pointer the target it was already being promised.
 */
function WorkbookRow({
	workbook,
	onRename,
	onDelete,
}: {
	workbook: WorkbookMeta;
	onRename: () => void;
	onDelete: () => void;
}) {
	const modified = new Date(workbook.updatedAt);
	const exact = modified.toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});
	const agent = workbook.lastActivity;

	return (
		<TableRow className="group relative">
			{/*
			 * `w-full max-w-0` is what makes `truncate` work inside a table
			 * cell: without a width to shrink against, the nowrap name simply
			 * widened the table and a long one ran off a phone screen behind a
			 * scrollbar the page gives no hint about.
			 */}
			<TableCell className="w-full max-w-0 p-0">
				<div className="flex items-center gap-2.5 px-2 py-2.5">
					<FileSpreadsheetIcon className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-2">
							<Link
								href={`/w/${workbook.id}`}
								title={workbook.name}
								className="truncate rounded-sm font-medium after:absolute after:inset-0 after:content-['']"
							>
								{workbook.name}
							</Link>
							{workbook.googleSpreadsheetId ? (
								<span className="shrink-0 text-muted-foreground">
									<Link2Icon aria-hidden className="size-3.5" />
									<span className="sr-only">
										Linked to a Google Sheet
									</span>
								</span>
							) : null}
							{/*
							 * The agent's hand, in the agent's colour and with
							 * its name in text — never colour alone. This is
							 * the one fact the list already had and threw away,
							 * and it is the product's whole claim: you can see
							 * what the machine did.
							 */}
							{agent ? (
								<span
									className="hidden shrink-0 items-center gap-1.5 text-[11px] text-agent sm:inline-flex"
									title={`Last edited by ${agent.author}`}
								>
									<span
										aria-hidden
										className="size-1.5 rounded-full bg-agent"
									/>
									{agent.author}
								</span>
							) : null}
						</div>
						{/* The two columns the narrow layout drops, folded back
						    in as a second line so a phone still answers "when?"
						    and "how big?". */}
						<p className="mt-0.5 truncate text-xs text-muted-foreground sm:hidden">
							<span suppressHydrationWarning>{formatWhen(modified)}</span>
							{" · "}
							{formatSize(workbook.size)}
							{agent ? (
								<>
									{" · "}
									<span className="text-agent">{agent.author}</span>
								</>
							) : null}
						</p>
					</div>
				</div>
			</TableCell>
			<TableCell
				className="hidden text-xs text-muted-foreground sm:table-cell"
				title={exact}
				suppressHydrationWarning
			>
				{formatWhen(modified)}
			</TableCell>
			<TableCell className="hidden text-right text-xs text-muted-foreground md:table-cell">
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
								// `relative` lifts it above the row-covering
								// link; focus-visible, not only hover, because a
								// keyboard user used to tab into a control at
								// opacity 0 — invisible, focus ring and all.
								className="relative size-7 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
							>
								<MoreHorizontalIcon className="size-4" />
							</Button>
						}
					/>
					<DropdownMenuContent align="end">
						<DropdownMenuItem onClick={onRename}>Rename</DropdownMenuItem>
						<DropdownMenuItem variant="destructive" onClick={onDelete}>
							Delete
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</TableCell>
		</TableRow>
	);
}

/**
 * A sortable column heading.
 *
 * `aria-sort` on the cell and the direction arrow carry the same fact, so the
 * order is legible whether you can see the arrow or not — and the arrow only
 * appears on the active column, keeping the header row quiet.
 */
function SortHeader({
	label,
	sortKey,
	sort,
	onSort,
	className,
	align = "left",
}: {
	label: string;
	sortKey: SortKey;
	sort: { key: SortKey; descending: boolean };
	onSort: (key: SortKey) => void;
	className?: string;
	align?: "left" | "right";
}) {
	const active = sort.key === sortKey;
	const Arrow = sort.descending ? ArrowDownIcon : ArrowUpIcon;
	return (
		<TableHead
			className={className}
			aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
		>
			<button
				type="button"
				className={cn(
					"-mx-1 flex w-full items-center gap-1 rounded-sm px-1 py-0.5 hover:text-foreground",
					align === "right" && "justify-end",
					active ? "text-foreground" : "text-muted-foreground",
				)}
				onClick={() => onSort(sortKey)}
			>
				{label}
				{active ? (
					<Arrow aria-hidden className="size-3 shrink-0" />
				) : (
					<span aria-hidden className="size-3 shrink-0" />
				)}
			</button>
		</TableHead>
	);
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** [how many of this unit make the next one, unit] */
const DIVISIONS: [number, Intl.RelativeTimeFormatUnit][] = [
	[60, "second"],
	[60, "minute"],
	[24, "hour"],
	[7, "day"],
	[4.34524, "week"],
	[12, "month"],
	[Number.POSITIVE_INFINITY, "year"],
];

/**
 * "14 minutes ago", not "Aug 28, 2026, 4:27 PM".
 *
 * The list lands sorted by recency, so recency is what it has to answer, and a
 * 21-character timestamp makes the reader do the subtraction. The exact time
 * stays on the cell's `title` for anyone who needs it.
 */
function formatWhen(date: Date): string {
	let duration = (date.getTime() - Date.now()) / 1000;
	for (const [amount, unit] of DIVISIONS) {
		if (Math.abs(duration) < amount)
			return RELATIVE.format(Math.round(duration), unit);
		duration /= amount;
	}
	return RELATIVE.format(Math.round(duration), "year");
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

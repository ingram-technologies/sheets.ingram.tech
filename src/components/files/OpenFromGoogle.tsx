"use client";

import {
	DownloadIcon,
	FileSpreadsheetIcon,
	FolderSearchIcon,
	Link2Icon,
	Loader2Icon,
	SearchIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { ensureIronCalc } from "@/components/workbook/ironcalc";
import { modelFromSnapshot } from "@/components/workbook/google-snapshot";
import { bytesToBase64 } from "@/lib/bytes";
import {
	isScopeMissing,
	requestSpreadsheetsAccess,
	SPREADSHEETS_ACCESS_EXPLAINER,
} from "@/lib/google-access";
import { pickerConfig, pickSpreadsheet } from "@/lib/google-picker";
import { parseSpreadsheetRef, snapshotSchema } from "@/lib/gsheets-transfer";

const importResponseSchema = z.object({
	spreadsheetId: z.string(),
	title: z.string(),
	snapshot: snapshotSchema,
});

const createdSchema = z.object({ id: z.string() });

const searchResponseSchema = z.object({
	files: z.array(
		z.object({
			id: z.string(),
			name: z.string(),
			modifiedTime: z.string().nullable(),
		}),
	),
});

const tokenResponseSchema = z.object({ accessToken: z.string() });

type Listing = z.infer<typeof searchResponseSchema>["files"][number];

/**
 * "Open from Google Sheets": one input that searches the user's reachable
 * spreadsheets (drive.file grant: created by this app or previously picked)
 * AND accepts a pasted URL/id; plus "Browse Google Drive" via the Google
 * Picker for everything else. Importing establishes the 1:1 link, so "Save
 * to Google Sheets" writes back to the same spreadsheet.
 */
export function OpenFromGoogle() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<Listing[] | null>(null);
	const [settledQuery, setSettledQuery] = useState<string | null>(null);
	const [scopeMissing, setScopeMissing] = useState(false);
	const [importing, setImporting] = useState(false);
	const [browsing, setBrowsing] = useState(false);

	const linkedId = parseSpreadsheetRef(query);
	const picker = pickerConfig();

	// A search is outstanding whenever the query the effect would fetch is not
	// the one it last finished. Derived rather than set from inside the effect,
	// so the very first render of a new query already reads as busy instead of
	// painting an idle frame and correcting it.
	const pendingQuery = open && !linkedId ? query : null;
	const searching = pendingQuery !== null && pendingQuery !== settledQuery;

	// Debounced search; an empty query lists the most recent spreadsheets.
	// Skipped while the input holds a pasted link — that's an import, not a
	// search.
	useEffect(() => {
		if (!open || linkedId) return;
		let cancelled = false;
		const timer = setTimeout(() => {
			void (async () => {
				try {
					const response = await fetch(
						`/api/gsheets/search?q=${encodeURIComponent(query)}`,
					);
					const body: unknown = await response.json();
					if (cancelled) return;
					if (!response.ok) {
						setResults(null);
						setScopeMissing(isScopeMissing(body));
						return;
					}
					setScopeMissing(false);
					setResults(searchResponseSchema.parse(body).files);
				} catch {
					if (!cancelled) setResults(null);
				} finally {
					if (!cancelled) setSettledQuery(query);
				}
			})();
		}, 250);
		return () => {
			cancelled = true;
			clearTimeout(timer);
		};
	}, [open, query, linkedId]);

	const importSheet = async (ref: string) => {
		setImporting(true);
		try {
			const response = await fetch("/api/gsheets/import", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ ref }),
			});
			const body: unknown = await response.json();
			if (!response.ok) {
				if (isScopeMissing(body)) {
					setScopeMissing(true);
					return;
				}
				throw new Error(apiError(body) ?? `import failed (${response.status})`);
			}
			const data = importResponseSchema.parse(body);
			await ensureIronCalc();
			const model = modelFromSnapshot(data.title, data.snapshot);
			const bytes = model.toBytes();
			model.free();
			const created = await fetch("/api/workbooks", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: data.title,
					bytes: bytesToBase64(bytes),
					googleSpreadsheetId: data.spreadsheetId,
				}),
			});
			if (!created.ok) throw new Error(`create failed (${created.status})`);
			const meta = createdSchema.parse(await created.json());
			router.push(`/w/${meta.id}`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Import from Google failed",
			);
			setImporting(false);
		}
	};

	// The Picker draws its own full-screen overlay, which would fight the
	// dialog's focus trap — close the dialog first, import from the pick.
	const browseDrive = async () => {
		if (!picker) return;
		setBrowsing(true);
		try {
			const response = await fetch("/api/gsheets/token");
			const body: unknown = await response.json();
			if (!response.ok) {
				if (isScopeMissing(body)) {
					setScopeMissing(true);
					return;
				}
				throw new Error(apiError(body) ?? "Google token unavailable");
			}
			const { accessToken } = tokenResponseSchema.parse(body);
			setOpen(false);
			const picked = await pickSpreadsheet(picker, accessToken);
			if (!picked) return;
			toast.promise(importSheet(picked), {
				loading: "Importing from Google Sheets…",
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Browse failed");
		} finally {
			setBrowsing(false);
		}
	};

	const reset = () => {
		setQuery("");
		setSettledQuery(null);
		setResults(null);
		setScopeMissing(false);
		setImporting(false);
	};

	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				<FileSpreadsheetIcon className="size-4" />
				Open from Google Sheets
			</Button>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (importing) return;
					setOpen(next);
					if (!next) reset();
				}}
			>
				<DialogContent className="max-w-lg gap-3">
					<DialogHeader>
						<DialogTitle>Open from Google Sheets</DialogTitle>
						<DialogDescription>
							The imported workbook stays linked — saving sends changes
							back to the same spreadsheet.
						</DialogDescription>
					</DialogHeader>

					<div className="relative">
						<SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							autoFocus
							className="pl-8"
							placeholder="Search your spreadsheets, or paste a link…"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							onKeyDown={(event) => {
								if (event.key !== "Enter" || importing) return;
								if (linkedId) void importSheet(linkedId);
								else if (results?.length === 1 && results[0]) {
									void importSheet(results[0].id);
								}
							}}
							disabled={importing}
						/>
					</div>

					{/* max-h, not just min-h: without a ceiling a long result
					    list grew the dialog past the viewport. */}
					<div
						role="listbox"
						aria-label="Search results"
						aria-busy={searching}
						className="max-h-64 min-h-48 overflow-y-auto rounded-md border border-border"
					>
						{scopeMissing ? (
							<ScopePrompt />
						) : linkedId ? (
							<ResultRow
								icon={Link2Icon}
								title="Import from this link"
								subtitle={linkedId}
								disabled={importing}
								onClick={() => void importSheet(linkedId)}
							/>
						) : searching && !results ? (
							<SearchSkeleton />
						) : results && results.length > 0 ? (
							<div className={searching ? "opacity-60" : undefined}>
								{results.map((file) => (
									<ResultRow
										key={file.id}
										icon={FileSpreadsheetIcon}
										title={file.name}
										subtitle={formatModified(file.modifiedTime)}
										disabled={importing}
										onClick={() => void importSheet(file.id)}
									/>
								))}
							</div>
						) : (
							<p className="px-4 py-8 text-center text-sm text-muted-foreground">
								{query
									? "No matches. Search only sees spreadsheets this app created or opened before — paste a link or browse Drive for the rest."
									: "Spreadsheets you save or open here will show up for quick access. Paste a link or browse Drive to get started."}
							</p>
						)}
					</div>

					<div className="flex items-center justify-between">
						{picker ? (
							<Button
								variant="ghost"
								size="sm"
								className="text-muted-foreground"
								disabled={browsing || importing}
								onClick={() => void browseDrive()}
							>
								<FolderSearchIcon className="size-4" />
								{browsing ? "Opening Drive…" : "Browse Google Drive"}
							</Button>
						) : (
							<span />
						)}
						{/* Import runs wasm + two network round-trips with the
						    dialog locked shut; an 11px word was the only sign
						    anything was happening. */}
						{importing ? (
							<span
								className="flex items-center gap-1.5 text-xs text-muted-foreground"
								role="status"
							>
								<Loader2Icon className="size-3 animate-spin" />
								Importing…
							</span>
						) : null}
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

function ResultRow({
	icon: Icon,
	title,
	subtitle,
	disabled,
	onClick,
}: {
	icon: typeof FileSpreadsheetIcon;
	title: string;
	subtitle: string | null;
	disabled: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			role="option"
			aria-selected={false}
			disabled={disabled}
			onClick={onClick}
			title={title}
			// focus-visible was missing entirely — the list was keyboard-
			// reachable but gave no sign of where you were.
			className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-accent/50 focus-visible:bg-accent focus-visible:outline-none disabled:opacity-50"
		>
			<Icon className="size-4 shrink-0 text-muted-foreground" />
			<span className="min-w-0 flex-1 truncate text-sm">{title}</span>
			{subtitle ? (
				<span className="shrink-0 text-xs text-muted-foreground">
					{subtitle}
				</span>
			) : null}
			{/* The ExternalLink icon that used to sit here was backwards: these
			    rows import INTO this app, they don't open anything externally. */}
			<DownloadIcon className="size-3.5 shrink-0 text-muted-foreground" />
		</button>
	);
}

function ScopePrompt() {
	return (
		<div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
			<p className="text-sm text-muted-foreground">
				{SPREADSHEETS_ACCESS_EXPLAINER}
			</p>
			<Button size="sm" onClick={() => void requestSpreadsheetsAccess("/")}>
				Grant access with Google
			</Button>
		</div>
	);
}

function SearchSkeleton() {
	return (
		<div className="space-y-2 p-3">
			{[0, 1, 2].map((row) => (
				<div key={row} className="h-8 animate-pulse rounded bg-accent/40" />
			))}
		</div>
	);
}

function formatModified(iso: string | null): string | null {
	if (!iso) return null;
	const date = new Date(iso);
	return Number.isNaN(date.getTime())
		? null
		: date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

function apiError(body: unknown): string | null {
	if (
		typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof body.error === "string"
	) {
		return body.error;
	}
	return null;
}

"use client";

import {
	ArrowLeftIcon,
	KeyboardIcon,
	PanelRightCloseIcon,
	PanelRightOpenIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
	changedCellsFromOutput,
	type WorkbookActivity,
	workbookActivitySchema,
} from "@/lib/activity";
import { formatCell, parseCell } from "@/lib/a1";
import { UserMenu } from "@/components/auth/UserMenu";
import { SheetsMark } from "@/components/brand/sheets-mark";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toaster";

import { WorkbookController } from "./controller";
import { ensureIronCalc, Model } from "./ironcalc";
import { FileMenu } from "./FileMenu";
import { FindBar } from "./FindBar";
import { FormulaBar } from "./FormulaBar";
import type { EditingState } from "./Grid";
import { Grid } from "./Grid";
import { useModKeyLabel } from "./mod-key";
import { SheetTabs } from "./SheetTabs";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";

type SaveState = "saved" | "dirty" | "saving" | "retrying" | "failed" | "conflict";

const AUTOSAVE_DEBOUNCE_MS = 1200;

/** `"3"` -> 3. Null when the header is missing or not a version ETag. */
function parseEtag(header: string | null): number | null {
	if (!header) return null;
	const match = /^"(\d+)"$/.exec(header.trim());
	if (!match?.[1]) return null;
	return Number(match[1]);
}

/**
 * How often an open tab checks whether something edited this workbook from
 * outside. Fast enough that an agent's edit feels live, slow enough to be a
 * rounding error on a single indexed row read.
 */
const REMOTE_POLL_MS = 2500;

/** First line of a script, for a one-line "what the agent is doing" label. */
function firstLine(script: string): string {
	const line = script.split("\n").find((l) => l.trim().length > 0) ?? script;
	return line.length > 80 ? `${line.slice(0, 79)}…` : line;
}

/** The activity record off a meta payload, or null if absent/malformed. */
function readActivity(body: unknown): WorkbookActivity | null {
	if (!body || typeof body !== "object" || !("lastActivity" in body)) return null;
	const parsed = workbookActivitySchema.safeParse(body.lastActivity);
	return parsed.success ? parsed.data : null;
}

/**
 * Pull `version` out of a workbook-meta JSON body. Narrowed by hand rather
 * than with the zod schema in lib/workbooks: that module imports the database
 * client, and pulling it into a client component would drag drizzle and pg
 * into the browser bundle.
 */
function readVersion(body: unknown, key: "version" | "meta"): number | null {
	if (!body || typeof body !== "object") return null;
	if (key === "meta") {
		return "meta" in body ? readVersion(body.meta, "version") : null;
	}
	if (!("version" in body)) return null;
	return typeof body.version === "number" ? body.version : null;
}

// Autosave retry backoff. Bounded: after the last attempt the UI stops
// claiming anything is in flight and hands the user an explicit Retry.
const RETRY_DELAYS_MS = [2000, 5000, 15000];

export function Workbook({
	id,
	name: initialName,
	googleSpreadsheetId,
}: {
	id: string;
	name: string;
	googleSpreadsheetId: string | null;
}) {
	const [controller, setController] = useState<WorkbookController | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("saved");
	const [editing, setEditing] = useState<EditingState | null>(null);
	const [name, setName] = useState(initialName);
	const [chatOpen, setChatOpen] = useState(true);
	/** Null = closed. "replace" opens the find panel with replace expanded. */
	const [find, setFind] = useState<"find" | "replace" | null>(null);
	const [shortcutsOpen, setShortcutsOpen] = useState(false);
	const modKey = useModKeyLabel();
	/** The most recent edit made from outside this tab, shown until dismissed. */
	const [remoteActivity, setRemoteActivity] = useState<WorkbookActivity | null>(null);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const attempt = useRef(0);
	const saveStateRef = useRef<SaveState>("saved");
	saveStateRef.current = saveState;
	/**
	 * The workbook version these bytes came from, carried as an ETag. Every
	 * save is a compare-and-swap against it, because the MCP endpoint can
	 * write this same workbook while the tab is open. Held in a ref, not
	 * state: the save callback must read the newest value without being
	 * re-created (and re-scheduling autosave) each time it changes.
	 */
	const version = useRef<number | null>(null);
	/** Server's version at the moment a save was rejected — what "Keep mine"
	 *  must write on top of to win the next round. */
	const serverVersion = useRef<number | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const [, response] = await Promise.all([
					ensureIronCalc(),
					fetch(`/api/workbooks/${id}/bytes`),
				]);
				if (!response.ok)
					throw new Error(`failed to load workbook (${response.status})`);
				const bytes = new Uint8Array(await response.arrayBuffer());
				if (cancelled) return;
				version.current = parseEtag(response.headers.get("etag"));
				const model = Model.from_bytes(bytes, "en");
				setController(new WorkbookController(model));
			} catch (error) {
				if (!cancelled) {
					const message =
						error instanceof Error ? error.message : String(error);
					// Engine bytes are version-locked; a decode failure means the
					// workbook was saved by an older engine build (see
					// docs/architecture.md) — say so instead of leaking wasm noise.
					setLoadError(
						message.includes("parsing workbook")
							? "This workbook was saved by an older engine version and cannot be opened by this build. Re-import it from an .xlsx export."
							: message,
					);
				}
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [id]);

	/**
	 * Autosave. A failed save used to set an error state and stop — while the
	 * UI said "retrying" — so an idle tab after a blip lost the work silently.
	 * This actually retries on a bounded backoff, and when the attempts run out
	 * it says "failed" and offers a real Retry rather than pretending.
	 */
	const save = useCallback(
		async (isRetry = false) => {
			if (!controller) return;
			if (retryTimer.current) {
				clearTimeout(retryTimer.current);
				retryTimer.current = null;
			}
			if (!isRetry) attempt.current = 0;
			setSaveState("saving");
			try {
				const bytes = controller.serialize();
				const known = version.current;
				const response = await fetch(`/api/workbooks/${id}/bytes`, {
					method: "PUT",
					headers: {
						"content-type": "application/octet-stream",
						// Conditional write: the server rejects this if the
						// workbook moved on (an MCP client wrote) since load.
						...(known === null ? {} : { "if-match": `"${known}"` }),
					},
					body: new Blob([bytes.buffer as ArrayBuffer]),
				});
				if (response.status === 412) {
					// Someone else — Claude Code over MCP — saved first.
					// Retrying cannot help and would overwrite them, so stop
					// and let the user choose. Their in-memory edits are
					// untouched; `serverVersion` is what "Keep mine" needs to
					// write on top of.
					const body: unknown = await response.json().catch(() => null);
					serverVersion.current = readVersion(body, "meta");
					setSaveState("conflict");
					return;
				}
				if (!response.ok) throw new Error(String(response.status));
				version.current = readVersion(await response.json(), "version");
				attempt.current = 0;
				setSaveState("saved");
			} catch {
				const delay = RETRY_DELAYS_MS[attempt.current];
				if (delay === undefined) {
					// Out of attempts. Stop claiming a retry is coming.
					setSaveState("failed");
					return;
				}
				attempt.current += 1;
				setSaveState("retrying");
				retryTimer.current = setTimeout(() => void save(true), delay);
			}
		},
		[controller, id],
	);

	/**
	 * Replace the in-memory workbook with the server's copy.
	 *
	 * Used when an MCP client has written this workbook — either detected by
	 * the poller, or discovered the hard way when a save was rejected. The
	 * user's cursor is carried across: without that, every agent edit would
	 * yank the view somewhere else mid-typing, since the engine serializes its
	 * own selection into the bytes.
	 *
	 * Local unsaved edits are lost by design, so this is only ever called when
	 * the document is clean or the user explicitly chose it.
	 */
	const adoptServerState = useCallback(
		async (activity?: WorkbookActivity | null): Promise<boolean> => {
			try {
				const response = await fetch(`/api/workbooks/${id}/bytes`);
				if (!response.ok) throw new Error(String(response.status));
				const bytes = new Uint8Array(await response.arrayBuffer());
				const nextVersion = parseEtag(response.headers.get("etag"));
				const model = Model.from_bytes(bytes, "en");
				const next = new WorkbookController(model);

				// Where the agent was working. The engine serializes its own
				// selection, so the incoming bytes carry the sheet the script
				// last touched — which is how the pulses land on the right
				// sheet without parsing sheet names out of the echo text.
				const agentSheet = next.selectedView().sheet;

				setController((previous) => {
					if (previous) {
						const view = previous.selectedView();
						next.view((m) => {
							m.setSelectedSheet(view.sheet);
							m.setSelectedCell(view.row, view.column);
						});
					}
					return next;
				});

				if (activity) {
					// Flash the cells the echo named, in the agent's colour, so
					// the change reads as something that *happened* rather than
					// the grid quietly being different. Best-effort by
					// construction (see changedCellsFromOutput) — the
					// authoritative account is the echo shown alongside.
					const changes = changedCellsFromOutput(activity.output)
						.map((ref) => parseCell(ref))
						.filter((ref) => ref !== null)
						.map((ref) => ({
							sheet: agentSheet,
							cell: formatCell(ref),
							old: "",
							new: "",
						}));
					if (changes.length > 0) next.pulseChanges(changes, "agent");
					next.setAgentStatus({
						phase: "editing",
						detail: firstLine(activity.script),
						sheet: agentSheet,
					});
					setRemoteActivity(activity);
				}

				version.current = nextVersion;
				attempt.current = 0;
				setSaveState("saved");
				return true;
			} catch {
				toast.error("Couldn't load the latest version");
				return false;
			}
		},
		[id],
	);

	/**
	 * Watch for edits made outside this tab — Claude Code working over MCP,
	 * with or without anyone looking at the screen.
	 *
	 * Polling, because there is no realtime channel yet (sheetd will bring
	 * one; see docs/architecture.md). Cheap: the meta endpoint is a single
	 * indexed row read, and the poll is skipped entirely when the tab is
	 * hidden or the document is dirty.
	 *
	 * Skipping while dirty is the important half. Adopting the server's copy
	 * throws away un-saved local edits, so the poller only ever acts on a
	 * clean document. If the user is mid-edit when the agent writes, nothing
	 * is taken from them — their next save hits the compare-and-swap and they
	 * get the explicit choice instead.
	 */
	useEffect(() => {
		if (!controller) return;
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		async function poll() {
			if (
				document.visibilityState === "visible" &&
				saveStateRef.current === "saved" &&
				version.current !== null
			) {
				try {
					const response = await fetch(`/api/workbooks/${id}`);
					if (response.ok) {
						const meta: unknown = await response.json();
						const latest = readVersion(meta, "version");
						if (latest !== null && latest > version.current) {
							await adoptServerState(readActivity(meta));
						}
					}
				} catch {
					// A failed poll is not worth telling the user about; the
					// next tick tries again, and a genuinely broken connection
					// surfaces through save state instead.
				}
			}
			if (!stopped) timer = setTimeout(() => void poll(), REMOTE_POLL_MS);
		}

		timer = setTimeout(() => void poll(), REMOTE_POLL_MS);
		return () => {
			stopped = true;
			if (timer) clearTimeout(timer);
		};
	}, [controller, id, adoptServerState]);

	/**
	 * Conflict resolution, user's choice: overwrite whatever the agent wrote
	 * by rebasing onto the server's current version and saving again.
	 */
	const keepLocalChanges = useCallback(() => {
		if (serverVersion.current !== null) version.current = serverVersion.current;
		void save();
	}, [save]);

	// Rename the whole document — shared by the header field and the agent's
	// rename_workbook tool. Optimistic with rollback; returns whether it stuck
	// so the agent can report honestly.
	const renameDocument = useCallback(
		async (next: string): Promise<boolean> => {
			const trimmed = next.trim();
			if (!trimmed) return false;
			if (trimmed === name) return true;
			const previous = name;
			setName(trimmed);
			try {
				const response = await fetch(`/api/workbooks/${id}`, {
					method: "PATCH",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name: trimmed }),
				});
				if (!response.ok) throw new Error(String(response.status));
				return true;
			} catch {
				setName(previous);
				toast.error("Couldn't rename the workbook");
				return false;
			}
		},
		[id, name],
	);

	// Debounced autosave on every content mutation.
	useEffect(() => {
		if (!controller) return;
		const unsubscribe = controller.onDirty(() => {
			setSaveState("dirty");
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
		});
		return () => {
			unsubscribe();
			if (saveTimer.current) clearTimeout(saveTimer.current);
			if (retryTimer.current) clearTimeout(retryTimer.current);
		};
	}, [controller, save]);

	/**
	 * App-level keys, bound to the window rather than the grid because they
	 * must work from the formula bar and the agent panel too.
	 *
	 * Each of these otherwise reaches the *browser* and does the wrong thing:
	 * Ctrl+S offers to save the page as HTML, and Ctrl+F opens a find bar that
	 * searches the DOM — which, for a canvas grid, is an empty document. In a
	 * spreadsheet both read as the app being broken.
	 */
	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const mod = event.ctrlKey || event.metaKey;
			const key = event.key.toLowerCase();
			if (mod && key === "s") {
				event.preventDefault();
				if (saveStateRef.current !== "saved") void save();
				return;
			}
			if (mod && (key === "f" || key === "h")) {
				event.preventDefault();
				setFind(key === "h" ? "replace" : "find");
				return;
			}
			// Closing Find lives here so it works wherever focus went — the
			// panel, the grid, or a cell you navigated to from a hit. The cell
			// editor stops Escape before it reaches the window, so cancelling
			// an edit does not also dismiss the search.
			if (event.key === "Escape") {
				setFind(null);
				return;
			}
			// Ctrl+/ (Google Sheets' own binding), not a bare "?". The grid
			// turns every printable key into the start of a cell edit, so "?"
			// would open this list AND leave a "?" being typed into the cell
			// behind it. A modifier keeps the two apart.
			if (mod && key === "/") {
				event.preventDefault();
				setShortcutsOpen(true);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [save]);

	// Flush on tab hide; warn before closing with unsaved changes.
	useEffect(() => {
		const onVisibility = () => {
			if (
				document.visibilityState === "hidden" &&
				saveStateRef.current !== "saved"
			) {
				void save();
			}
		};
		const onBeforeUnload = (event: BeforeUnloadEvent) => {
			// Anything but a clean "saved" means unflushed work — including a
			// failed save, which the old check missed entirely.
			if (saveStateRef.current !== "saved") event.preventDefault();
		};
		document.addEventListener("visibilitychange", onVisibility);
		window.addEventListener("beforeunload", onBeforeUnload);
		return () => {
			document.removeEventListener("visibilitychange", onVisibility);
			window.removeEventListener("beforeunload", onBeforeUnload);
		};
	}, [save]);

	if (loadError) {
		return (
			<div className="flex h-dvh items-center justify-center p-6">
				<div className="max-w-md space-y-3 text-center">
					<p className="text-sm text-destructive-ink" role="alert">
						{loadError}
					</p>
					<Link href="/" className="text-sm text-muted-foreground underline">
						Back to workbooks
					</Link>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-dvh flex-col bg-background text-foreground">
			<header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
				<Link
					href="/"
					aria-label="All workbooks"
					className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
				>
					<ArrowLeftIcon className="size-4" />
				</Link>
				{/* The brand mark, not a generic grid glyph — login already uses it. */}
				<SheetsMark className="size-4 shrink-0 text-primary" />
				<WorkbookName name={name} rename={renameDocument} />
				<FileMenu
					controller={controller}
					workbookId={id}
					name={name}
					initialGoogleSpreadsheetId={googleSpreadsheetId}
				/>

				<SaveIndicator
					state={saveState}
					onRetry={() => void save()}
					onDiscardLocal={() => void adoptServerState()}
					onKeepLocal={keepLocalChanges}
				/>

				{/*
				 * A shortcut list is worth nothing to a device with no
				 * keyboard, and at 390px this header is already carrying eight
				 * controls. Hidden by pointer capability, not by width: a
				 * narrow window on a laptop still has the keys.
				 */}
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								className="hidden size-7 text-muted-foreground [@media(any-hover:hover)]:flex"
								aria-label="Keyboard shortcuts"
								onClick={() => setShortcutsOpen(true)}
							>
								<KeyboardIcon className="size-4" />
							</Button>
						}
					/>
					<TooltipContent>Keyboard shortcuts ({modKey}+/)</TooltipContent>
				</Tooltip>

				<Button
					variant="ghost"
					size="icon"
					className="size-7 text-muted-foreground"
					aria-expanded={chatOpen}
					aria-controls="agent-panel"
					aria-label={chatOpen ? "Hide agent panel" : "Show agent panel"}
					onClick={() => setChatOpen((open) => !open)}
				>
					{chatOpen ? (
						<PanelRightCloseIcon className="size-4" />
					) : (
						<PanelRightOpenIcon className="size-4" />
					)}
				</Button>
				<UserMenu />
			</header>

			{controller ? (
				<>
					<Toolbar controller={controller} />
					<FormulaBar controller={controller} />
					{remoteActivity ? (
						<RemoteActivityBar
							activity={remoteActivity}
							onDismiss={() => setRemoteActivity(null)}
						/>
					) : null}
					<div className="relative flex min-h-0 flex-1">
						{/*
						 * `relative` anchors the find panel to the grid column,
						 * NOT inside <Grid> itself. The grid container owns a
						 * keydown handler that turns any printable key into a
						 * cell edit, so a panel rendered as its child leaks
						 * every keystroke typed into the search box straight
						 * into the sheet — Enter opened the cell editor, and
						 * typing edited cells. Sibling placement makes that
						 * structurally impossible rather than something a
						 * stopPropagation call has to remember.
						 */}
						<div className="relative flex min-w-0 flex-1 flex-col">
							{find ? (
								<FindBar
									controller={controller}
									mode={find}
									onClose={() => setFind(null)}
								/>
							) : null}
							<div className="min-h-0 flex-1">
								<Grid
									controller={controller}
									editing={editing}
									setEditing={setEditing}
								/>
							</div>
							<SheetTabs controller={controller} />
							<StatusBar controller={controller} />
						</div>
						{/*
						 * Two principals, one document — but the grid is
						 * unusable below ~600px of width, so the panel is
						 * collapsible rather than permanently pinned. It
						 * overlays on narrow screens and sits beside the grid
						 * from `md` up.
						 */}
						{chatOpen ? (
							<aside
								id="agent-panel"
								aria-label="Agent"
								className="absolute inset-y-0 right-0 z-[var(--z-sticky)] w-80 max-w-[85vw] border-l border-border bg-background md:static md:z-auto md:w-80 md:max-w-none xl:w-96"
							>
								<ChatPanel
									controller={controller}
									renameDocument={renameDocument}
								/>
							</aside>
						) : null}
					</div>
					<ShortcutsDialog
						open={shortcutsOpen}
						onOpenChange={setShortcutsOpen}
					/>
				</>
			) : (
				<div
					className="flex flex-1 items-center justify-center text-sm text-muted-foreground"
					role="status"
					aria-busy="true"
				>
					Loading workbook…
				</div>
			)}
		</div>
	);
}

/**
 * What just changed in this workbook, when it wasn't you.
 *
 * The grid updating on its own is the demo, but on its own it is also
 * unnerving — so this says who did it and shows the script and the recalc echo
 * verbatim. The echo is the authoritative account of the edit (the cell
 * pulses are best-effort decoration), which is why it is reproduced in full
 * rather than summarised.
 */
function RemoteActivityBar({
	activity,
	onDismiss,
}: {
	activity: WorkbookActivity;
	onDismiss: () => void;
}) {
	return (
		<div
			className="flex shrink-0 items-start gap-2 border-b border-border bg-agent-bg px-3 py-1.5 text-[11px]"
			role="status"
			aria-live="polite"
		>
			<span className="mt-px font-medium whitespace-nowrap text-agent">
				{activity.author} edited
			</span>
			<details className="min-w-0 flex-1">
				<summary className="cursor-pointer truncate text-muted-foreground marker:content-['']">
					{firstLine(activity.script)}
				</summary>
				<pre className="mt-1.5 max-h-40 overflow-auto font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
					{activity.script}
					{"\n\n"}
					{activity.output}
				</pre>
			</details>
			<Button
				variant="ghost"
				size="sm"
				className="-my-0.5 h-5 shrink-0 px-1.5 text-[11px] text-muted-foreground"
				onClick={onDismiss}
			>
				Dismiss
			</Button>
		</div>
	);
}

/**
 * Save state. Every label here must be literally true — this is the one place
 * where a comforting lie costs the user their work.
 */
function SaveIndicator({
	state,
	onRetry,
	onDiscardLocal,
	onKeepLocal,
}: {
	state: SaveState;
	onRetry: () => void;
	onDiscardLocal: () => void;
	onKeepLocal: () => void;
}) {
	return (
		<div
			className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground"
			// Announce save transitions — especially failure, which is
			// otherwise a small grey word a screen reader never reaches.
			aria-live="polite"
			aria-atomic="true"
		>
			{state === "saved" && <span>Saved</span>}
			{state === "dirty" && <span>Unsaved changes</span>}
			{state === "saving" && <span>Saving…</span>}
			{state === "retrying" && (
				<span className="text-warning">Save failed — retrying</span>
			)}
			{state === "failed" && (
				<>
					<span className="text-destructive-ink">Not saved</span>
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 text-[11px]"
						onClick={onRetry}
					>
						Retry
					</Button>
				</>
			)}
			{/* Both sides of a conflict are real work, and nothing here can
			    merge them — so the choice is the user's, stated plainly,
			    with no default that quietly discards one of them. */}
			{state === "conflict" && (
				<>
					<span className="text-warning">Changed elsewhere</span>
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 text-[11px]"
						onClick={onDiscardLocal}
					>
						Load theirs
					</Button>
					<Button
						variant="outline"
						size="sm"
						className="h-6 px-2 text-[11px]"
						onClick={onKeepLocal}
					>
						Keep mine
					</Button>
				</>
			)}
		</div>
	);
}

function WorkbookName({
	name,
	rename,
}: {
	name: string;
	rename: (next: string) => Promise<boolean>;
}) {
	const [value, setValue] = useState(name);

	// Reflect renames that land from elsewhere — the agent's rename_workbook
	// tool, or a rollback — into the editable field.
	useEffect(() => {
		setValue(name);
	}, [name]);

	const commit = async () => {
		const next = value.trim();
		if (!next || next === name) {
			setValue(next || name);
			return;
		}
		// rename is optimistic and rolls the name back on failure; the effect
		// above then resyncs this field, so nothing extra to handle here.
		await rename(next);
	};

	return (
		<input
			value={value}
			// The header truncates; the full name stays reachable on hover.
			title={value}
			onChange={(event) => setValue(event.target.value)}
			onBlur={() => void commit()}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
				if (event.key === "Escape") {
					setValue(name);
					event.currentTarget.blur();
				}
			}}
			aria-label="Workbook name"
			className="h-7 min-w-0 max-w-64 rounded-sm bg-transparent px-1.5 text-sm font-medium outline-none hover:bg-accent/50 focus:bg-accent/50 focus:ring-1 focus:ring-ring"
		/>
	);
}

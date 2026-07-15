"use client";

import { ArrowLeft, PanelRightClose, PanelRightOpen } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { UserMenu } from "@/components/auth/UserMenu";
import { SheetsMark } from "@/components/brand/sheets-mark";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

import { WorkbookController } from "./controller";
import { ensureIronCalc, Model } from "./ironcalc";
import { FileMenu } from "./FileMenu";
import { FormulaBar } from "./FormulaBar";
import type { EditingState } from "./Grid";
import { Grid } from "./Grid";
import { SheetTabs } from "./SheetTabs";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";

type SaveState = "saved" | "dirty" | "saving" | "retrying" | "failed";

const AUTOSAVE_DEBOUNCE_MS = 1200;
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
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const attempt = useRef(0);
	const saveStateRef = useRef<SaveState>("saved");
	saveStateRef.current = saveState;

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
				const response = await fetch(`/api/workbooks/${id}/bytes`, {
					method: "PUT",
					headers: { "content-type": "application/octet-stream" },
					body: new Blob([bytes.buffer as ArrayBuffer]),
				});
				if (!response.ok) throw new Error(String(response.status));
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
					<ArrowLeft className="size-4" />
				</Link>
				{/* The brand mark, not a generic grid glyph — login already uses it. */}
				<SheetsMark className="size-4 shrink-0 text-primary" />
				<WorkbookName id={id} name={name} setName={setName} />
				<FileMenu
					controller={controller}
					workbookId={id}
					name={name}
					initialGoogleSpreadsheetId={googleSpreadsheetId}
				/>

				<SaveIndicator state={saveState} onRetry={() => void save()} />

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
						<PanelRightClose className="size-4" />
					) : (
						<PanelRightOpen className="size-4" />
					)}
				</Button>
				<UserMenu />
			</header>

			{controller ? (
				<>
					<Toolbar controller={controller} />
					<FormulaBar controller={controller} />
					<div className="relative flex min-h-0 flex-1">
						<div className="flex min-w-0 flex-1 flex-col">
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
								<ChatPanel controller={controller} />
							</aside>
						) : null}
					</div>
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
 * Save state. Every label here must be literally true — this is the one place
 * where a comforting lie costs the user their work.
 */
function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
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
		</div>
	);
}

function WorkbookName({
	id,
	name,
	setName,
}: {
	id: string;
	name: string;
	setName: (name: string) => void;
}) {
	const [value, setValue] = useState(name);

	const commit = async () => {
		const next = value.trim();
		if (!next || next === name) {
			setValue(next || name);
			return;
		}
		const previous = name;
		setName(next);
		try {
			const response = await fetch(`/api/workbooks/${id}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ name: next }),
			});
			if (!response.ok) throw new Error(String(response.status));
		} catch {
			// Roll back rather than leave the header showing a name the server
			// never accepted.
			setName(previous);
			setValue(previous);
			toast.error("Couldn't rename the workbook");
		}
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

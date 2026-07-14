"use client";

import { ArrowLeft, Download, Grid3x3 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { UserMenu } from "@/components/auth/UserMenu";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { WorkbookController } from "./controller";
import { ensureIronCalc, Model } from "./ironcalc";
import { exportXlsx } from "./export-xlsx";
import { FormulaBar } from "./FormulaBar";
import type { EditingState } from "./Grid";
import { Grid } from "./Grid";
import { SheetTabs } from "./SheetTabs";
import { StatusBar } from "./StatusBar";
import { Toolbar } from "./Toolbar";

type SaveState = "saved" | "dirty" | "saving" | "error";

const AUTOSAVE_DEBOUNCE_MS = 1200;

export function Workbook({ id, name: initialName }: { id: string; name: string }) {
	const [controller, setController] = useState<WorkbookController | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("saved");
	const [editing, setEditing] = useState<EditingState | null>(null);
	const [name, setName] = useState(initialName);
	const [exporting, setExporting] = useState(false);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

	const save = useCallback(async () => {
		if (!controller) return;
		setSaveState("saving");
		try {
			const bytes = controller.serialize();
			const response = await fetch(`/api/workbooks/${id}/bytes`, {
				method: "PUT",
				headers: { "content-type": "application/octet-stream" },
				body: new Blob([bytes.buffer as ArrayBuffer]),
			});
			if (!response.ok) throw new Error(String(response.status));
			setSaveState("saved");
		} catch {
			// Autosave failure is non-fatal: keep the dirty flag so the next
			// change (or tab-hide flush) retries.
			setSaveState("error");
		}
	}, [controller, id]);

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
			if (saveStateRef.current === "dirty" || saveStateRef.current === "saving") {
				event.preventDefault();
			}
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
			<div className="flex h-dvh items-center justify-center">
				<div className="space-y-2 text-center">
					<p className="text-sm text-destructive">{loadError}</p>
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
					className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
				>
					<ArrowLeft className="size-4" />
				</Link>
				<Grid3x3 className="size-4 text-primary" />
				<WorkbookName id={id} name={name} setName={setName} />
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								variant="ghost"
								size="icon"
								aria-label="Download as Excel"
								className="size-7 text-muted-foreground"
								disabled={!controller || exporting}
								onClick={async () => {
									if (!controller) return;
									setExporting(true);
									try {
										await exportXlsx(controller, name);
									} catch (error) {
										toast.error(
											error instanceof Error
												? error.message
												: "Export failed",
										);
									} finally {
										setExporting(false);
									}
								}}
							>
								<Download className="size-4" />
							</Button>
						}
					/>
					<TooltipContent>Download as Excel (.xlsx)</TooltipContent>
				</Tooltip>
				<span className="ml-auto text-[11px] text-muted-foreground">
					{saveState === "saved" && "Saved"}
					{saveState === "dirty" && "Unsaved changes"}
					{saveState === "saving" && "Saving…"}
					{saveState === "error" && (
						<span className="text-warning">Save failed — retrying</span>
					)}
				</span>
				<UserMenu />
			</header>

			{controller ? (
				<>
					<Toolbar controller={controller} />
					<FormulaBar controller={controller} />
					<div className="flex min-h-0 flex-1">
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
						<aside className="w-80 shrink-0 border-l border-border xl:w-96">
							<ChatPanel controller={controller} />
						</aside>
					</div>
				</>
			) : (
				<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
					Loading workbook…
				</div>
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
		setName(next);
		await fetch(`/api/workbooks/${id}`, {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: next }),
		});
	};

	return (
		<input
			value={value}
			onChange={(event) => setValue(event.target.value)}
			onBlur={() => void commit()}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
			}}
			aria-label="Workbook name"
			className="h-7 min-w-0 max-w-64 rounded-sm bg-transparent px-1.5 text-sm font-medium outline-none hover:bg-accent/50 focus:bg-accent/50 focus:ring-1 focus:ring-ring"
		/>
	);
}

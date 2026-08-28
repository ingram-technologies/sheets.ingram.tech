"use client";

import {
	ChevronDownIcon,
	CopyIcon,
	ExternalLinkIcon,
	FileDownIcon,
	FileUpIcon,
	Loader2Icon,
	PencilLineIcon,
	Trash2Icon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

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
import { toast } from "@/components/ui/toaster";
import { bytesToBase64 } from "@/lib/bytes";
import { isScopeMissing, requestSpreadsheetsAccess } from "@/lib/google-access";
import { spreadsheetUrl } from "@/lib/gsheets-transfer";

import type { WorkbookController } from "./controller";
import { exportXlsx } from "./export-xlsx";
import { buildGoogleSnapshot } from "./google-snapshot";

const saveResponseSchema = z.object({ spreadsheetId: z.string(), url: z.string() });
const createdSchema = z.object({ id: z.string() });

/** Where the workbook list lives. `/` is the public landing page, not the list. */
const WORKBOOK_LIST = "/spreadsheets";

export function FileMenu({
	controller,
	workbookId,
	name,
	initialGoogleSpreadsheetId,
	onRename,
}: {
	controller: WorkbookController | null;
	workbookId: string;
	name: string;
	initialGoogleSpreadsheetId: string | null;
	/** Hands focus to the title field in the header — renaming happens there. */
	onRename: () => void;
}) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [confirmOverwrite, setConfirmOverwrite] = useState(false);
	const [googleId, setGoogleId] = useState(initialGoogleSpreadsheetId);

	const saveToGoogle = async () => {
		if (!controller) return;
		setBusy(true);
		try {
			const snapshot = buildGoogleSnapshot(controller);
			const response = await fetch(`/api/workbooks/${workbookId}/gsheet`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ snapshot }),
			});
			const body: unknown = await response.json();
			if (!response.ok) {
				if (isScopeMissing(body)) {
					toast("Sheets needs access to your Google Sheets", {
						description:
							"Google asked for this permission separately at sign-in.",
						action: {
							label: "Grant access",
							onClick: () =>
								void requestSpreadsheetsAccess(
									window.location.pathname,
								),
						},
					});
					return;
				}
				throw new Error(apiError(body) ?? `save failed (${response.status})`);
			}
			const saved = saveResponseSchema.parse(body);
			setGoogleId(saved.spreadsheetId);
			toast.success(
				googleId
					? "Saved to the linked Google Sheet"
					: "Saved to Google Sheets",
				{
					action: {
						label: "Open",
						onClick: () => window.open(saved.url, "_blank", "noopener"),
					},
				},
			);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Save to Google Sheets failed",
			);
		} finally {
			setBusy(false);
		}
	};

	/**
	 * A second workbook holding what is on screen right now — including edits
	 * the autosave debounce has not flushed yet, because the bytes come from
	 * the live engine rather than from the server's copy. That is the whole
	 * point of the verb: "keep this state, then keep working".
	 *
	 * The copy deliberately does NOT inherit the Google Sheets link. Two
	 * workbooks pointing at one spreadsheet means whichever is saved last
	 * silently overwrites the other.
	 */
	const duplicate = async () => {
		if (!controller) return;
		setBusy(true);
		try {
			const response = await fetch("/api/workbooks", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: `${name} (copy)`.slice(0, 200),
					bytes: bytesToBase64(controller.serialize()),
				}),
			});
			if (!response.ok) {
				throw new Error(`duplicate failed (${response.status})`);
			}
			const created = createdSchema.parse(await response.json());
			router.push(`/w/${created.id}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Couldn't duplicate");
			setBusy(false);
		}
	};

	const restore = async () => {
		const response = await fetch(`/api/workbooks/${workbookId}/restore`, {
			method: "POST",
		});
		if (!response.ok) {
			toast.error("Couldn't restore the workbook — look in the trash");
			return;
		}
		router.push(`/w/${workbookId}`);
	};

	/**
	 * Trash is a soft delete, so one deliberate menu click is the right gate —
	 * the same call the list makes, and the same reasoning. The reversal rides
	 * on the toast rather than requiring the user to know the Trash exists.
	 */
	const moveToTrash = async () => {
		const response = await fetch(`/api/workbooks/${workbookId}`, {
			method: "DELETE",
		});
		if (!response.ok) {
			toast.error("Couldn't move this workbook to the trash");
			return;
		}
		router.push(WORKBOOK_LIST);
		toast.success(`Moved “${name}” to trash`, {
			action: { label: "Undo", onClick: () => void restore() },
		});
	};

	const downloadXlsx = async () => {
		if (!controller) return;
		setBusy(true);
		try {
			await exportXlsx(controller, name);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Export failed");
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="sm"
							className="h-7 gap-1 px-2 text-muted-foreground"
							disabled={!controller || busy}
						>
							{/* The trigger merely went disabled while a multi-second
						    export ran, with the label still reading "File" —
						    indistinguishable from dead UI. */}
							{busy ? (
								<Loader2Icon className="size-3.5 animate-spin" />
							) : null}
							{busy ? "Working…" : "File"}
							{busy ? null : <ChevronDownIcon className="size-3.5" />}
						</Button>
					}
				/>
				<DropdownMenuContent align="start" className="min-w-56">
					{/*
					 * The menu was export-only while its trigger said "File",
					 * so the three things a file *is* — rename it, copy it,
					 * throw it away — lived nowhere in the workbook at all.
					 */}
					<DropdownMenuItem onClick={onRename}>
						<PencilLineIcon className="size-4" />
						Rename…
					</DropdownMenuItem>
					<DropdownMenuItem onClick={() => void duplicate()}>
						<CopyIcon className="size-4" />
						Duplicate
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={() => {
							// Re-saving full-replaces the linked spreadsheet. Doing
							// that to a live Google doc deserves a confirmation; the
							// first save creates a new one and doesn't.
							if (googleId) setConfirmOverwrite(true);
							else void saveToGoogle();
						}}
					>
						<FileUpIcon className="size-4" />
						{googleId
							? "Save to linked Google Sheet"
							: "Save to Google Sheets"}
					</DropdownMenuItem>
					{googleId ? (
						<DropdownMenuItem
							onClick={() =>
								window.open(
									spreadsheetUrl(googleId),
									"_blank",
									"noopener",
								)
							}
						>
							<ExternalLinkIcon className="size-4" />
							Open in Google Sheets
						</DropdownMenuItem>
					) : null}
					<DropdownMenuSeparator />
					<DropdownMenuItem onClick={() => void downloadXlsx()}>
						<FileDownIcon className="size-4" />
						Download as Excel (.xlsx)
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onClick={() => void moveToTrash()}
					>
						<Trash2Icon className="size-4" />
						Move to trash
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Dialog open={confirmOverwrite} onOpenChange={setConfirmOverwrite}>
				<DialogContent className="max-w-sm">
					<DialogHeader>
						<DialogTitle>Replace the linked Google Sheet?</DialogTitle>
						<DialogDescription>
							This replaces everything in the linked spreadsheet with this
							workbook&apos;s contents. Any edits made in Google Sheets
							since the last save will be lost.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setConfirmOverwrite(false)}
						>
							Cancel
						</Button>
						<Button
							variant="destructive"
							onClick={() => {
								setConfirmOverwrite(false);
								void saveToGoogle();
							}}
						>
							Replace
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
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

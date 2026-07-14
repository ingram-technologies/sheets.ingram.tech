"use client";

import { ChevronDown, ExternalLink, FileDown, FileUp } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toaster";
import { isScopeMissing, requestSpreadsheetsAccess } from "@/lib/google-access";
import { spreadsheetUrl } from "@/lib/gsheets-transfer";

import type { WorkbookController } from "./controller";
import { exportXlsx } from "./export-xlsx";
import { buildGoogleSnapshot } from "./google-snapshot";

const saveResponseSchema = z.object({ spreadsheetId: z.string(), url: z.string() });

export function FileMenu({
	controller,
	workbookId,
	name,
	initialGoogleSpreadsheetId,
}: {
	controller: WorkbookController | null;
	workbookId: string;
	name: string;
	initialGoogleSpreadsheetId: string | null;
}) {
	const [busy, setBusy] = useState(false);
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
		<DropdownMenu>
			<DropdownMenuTrigger
				render={
					<Button
						variant="ghost"
						size="sm"
						className="h-7 gap-1 px-2 text-muted-foreground"
						disabled={!controller || busy}
					>
						File
						<ChevronDown className="size-3.5" />
					</Button>
				}
			/>
			<DropdownMenuContent align="start" className="min-w-56">
				<DropdownMenuItem onClick={() => void saveToGoogle()}>
					<FileUp className="size-4" />
					{googleId ? "Save to linked Google Sheet" : "Save to Google Sheets"}
				</DropdownMenuItem>
				{googleId ? (
					<DropdownMenuItem
						onClick={() =>
							window.open(spreadsheetUrl(googleId), "_blank", "noopener")
						}
					>
						<ExternalLink className="size-4" />
						Open in Google Sheets
					</DropdownMenuItem>
				) : null}
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={() => void downloadXlsx()}>
					<FileDown className="size-4" />
					Download as Excel (.xlsx)
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
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

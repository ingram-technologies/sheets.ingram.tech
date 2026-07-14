"use client";

import { FileInput } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { ensureIronCalc } from "@/components/workbook/ironcalc";
import { modelFromSnapshot } from "@/components/workbook/google-snapshot";
import { bytesToBase64 } from "@/lib/bytes";
import { isScopeMissing, requestSpreadsheetsAccess } from "@/lib/google-access";
import { snapshotSchema } from "@/lib/gsheets-transfer";

const importResponseSchema = z.object({
	spreadsheetId: z.string(),
	title: z.string(),
	snapshot: snapshotSchema,
});

const createdSchema = z.object({ id: z.string() });

/**
 * "Open from Google Sheets": paste a spreadsheet URL (or id), the server
 * reads it into a neutral snapshot, the browser builds the engine workbook
 * from it, and the new workbook keeps the 1:1 link so "Save to Google
 * Sheets" writes back to the same spreadsheet.
 */
export function OpenFromGoogle() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [ref, setRef] = useState("");
	const [importing, setImporting] = useState(false);

	const importSheet = async () => {
		if (!ref.trim()) return;
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
					setOpen(false);
					toast("Sheets needs access to your Google Sheets", {
						description:
							"Google asked for this permission separately at sign-in.",
						action: {
							label: "Grant access",
							onClick: () => void requestSpreadsheetsAccess("/"),
						},
					});
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

	return (
		<>
			<Button variant="outline" onClick={() => setOpen(true)}>
				<FileInput className="size-4" />
				Open from Google Sheets
			</Button>
			<Dialog
				open={open}
				onOpenChange={(next) => {
					if (!importing) setOpen(next);
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Open from Google Sheets</DialogTitle>
						<DialogDescription>
							Paste a Google Sheets link (or spreadsheet id). The imported
							workbook stays linked, so saving sends changes back to the
							same spreadsheet.
						</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void importSheet();
						}}
					>
						<Input
							autoFocus
							placeholder="https://docs.google.com/spreadsheets/d/…"
							value={ref}
							onChange={(event) => setRef(event.target.value)}
							disabled={importing}
						/>
						<DialogFooter className="mt-4">
							<Button
								type="submit"
								size="sm"
								disabled={importing || !ref.trim()}
							>
								{importing ? "Importing…" : "Import"}
							</Button>
						</DialogFooter>
					</form>
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

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { z } from "zod";

import { toast } from "@/components/ui/toaster";
import { ensureIronCalc } from "@/components/workbook/ironcalc";
import { modelFromSnapshot } from "@/components/workbook/google-snapshot";
import { bytesToBase64 } from "@/lib/bytes";
import { csvToSnapshot, fileStem, parseCsv } from "@/lib/csv";

const createdSchema = z.object({ id: z.string() });

// Well past any CSV that fits the 150k-cell snapshot cap; guards against
// feeding a multi-hundred-MB file to the parser before the cap can kick in.
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * "Import CSV" (and TSV): everything happens in the browser — parse, build a
 * real engine workbook, upload its bytes — mirroring how Google Sheets import
 * consumes its snapshot. Values go through the engine's input parser, so
 * numbers, dates, and formulas behave as if typed.
 *
 * Headless, because the trigger now lives inside a dropdown menu: a file input
 * rendered as a menu item's sibling would unmount with the menu, and the
 * picker would never open. The host renders `input` at page level and calls
 * `pick` from wherever the affordance lives.
 */
export function useCsvImport(): {
	importing: boolean;
	pick: () => void;
	input: React.ReactNode;
} {
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [importing, setImporting] = useState(false);

	const importFile = useCallback(
		async (file: File) => {
			setImporting(true);
			try {
				if (file.size > MAX_FILE_BYTES) {
					throw new Error("That file is too large to import (25 MB max).");
				}
				const name = fileStem(file.name);
				const snapshot = csvToSnapshot(name, parseCsv(await file.text()));
				if (!snapshot) {
					throw new Error(
						"That file has too many cells to import (150,000 max).",
					);
				}
				await ensureIronCalc();
				const model = modelFromSnapshot(name, snapshot);
				const bytes = model.toBytes();
				model.free();
				const created = await fetch("/api/workbooks", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({ name, bytes: bytesToBase64(bytes) }),
				});
				if (!created.ok) throw new Error(`create failed (${created.status})`);
				const meta = createdSchema.parse(await created.json());
				router.push(`/w/${meta.id}`);
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "CSV import failed",
				);
				setImporting(false);
			}
		},
		[router],
	);

	const input = (
		<input
			ref={inputRef}
			type="file"
			accept=".csv,.tsv,text/csv,text/tab-separated-values"
			className="hidden"
			onChange={(event) => {
				const file = event.target.files?.[0];
				// Reset so picking the same file again re-fires onChange.
				event.target.value = "";
				if (file) void importFile(file);
			}}
		/>
	);

	return {
		importing,
		pick: useCallback(() => inputRef.current?.click(), []),
		input,
	};
}

import { z } from "zod";

import { exportToGoogle, getGoogleToken, gsheetsErrorResponse } from "@/lib/gsheets";
import { snapshotSchema, spreadsheetUrl } from "@/lib/gsheets-transfer";
import { getSession } from "@/lib/session";
import { getWorkbookMeta, linkGoogleSpreadsheet } from "@/lib/workbooks";

type Params = { params: Promise<{ id: string }> };

// Snapshot conversion + two Google round-trips can outlast the default limit.
export const maxDuration = 60;

const bodySchema = z.object({ snapshot: snapshotSchema });

/**
 * "Save to Google Sheets": first save creates a spreadsheet and links it 1:1
 * to the workbook; every later save full-replaces the same spreadsheet. The
 * browser sends the engine snapshot — the server never parses workbook bytes.
 */
export async function POST(request: Request, { params }: Params) {
	const session = await getSession();
	if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
	const { id } = await params;
	const meta = await getWorkbookMeta(id);
	if (!meta) return Response.json({ error: "not found" }, { status: 404 });

	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
	}

	try {
		const token = await getGoogleToken(session.user.id);
		const { spreadsheetId } = await exportToGoogle(token, parsed.data.snapshot, {
			title: meta.name,
			spreadsheetId: meta.googleSpreadsheetId,
		});
		if (spreadsheetId !== meta.googleSpreadsheetId) {
			await linkGoogleSpreadsheet(id, spreadsheetId);
		}
		return Response.json({ spreadsheetId, url: spreadsheetUrl(spreadsheetId) });
	} catch (error) {
		return gsheetsErrorResponse(error);
	}
}

import { z } from "zod";

import { getGoogleToken, gsheetsErrorResponse, importFromGoogle } from "@/lib/gsheets";
import { parseSpreadsheetRef } from "@/lib/gsheets-transfer";
import { getSession } from "@/lib/session";

// Reading a large spreadsheet's grid can outlast the default limit.
export const maxDuration = 60;

const bodySchema = z.object({ ref: z.string().min(1).max(2000) });

/**
 * "Open from Google Sheets": resolve a URL (or bare spreadsheet id) and
 * return the neutral snapshot. The browser then builds the engine workbook
 * from it and creates the (gsheet-linked) workbook via POST /api/workbooks.
 */
export async function POST(request: Request) {
	const session = await getSession();
	if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
	}
	const spreadsheetId = parseSpreadsheetRef(parsed.data.ref);
	if (!spreadsheetId) {
		return Response.json(
			{ error: "That doesn't look like a Google Sheets URL or spreadsheet id." },
			{ status: 400 },
		);
	}
	try {
		const token = await getGoogleToken(session.user.id);
		const { title, snapshot } = await importFromGoogle(token, spreadsheetId);
		return Response.json({ spreadsheetId, title, snapshot });
	} catch (error) {
		return gsheetsErrorResponse(error);
	}
}

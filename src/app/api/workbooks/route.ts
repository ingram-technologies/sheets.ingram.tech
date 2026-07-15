import { z } from "zod";

import { requireApiUser } from "@/lib/session";
import { createWorkbook, listWorkbooks } from "@/lib/workbooks";

export async function GET() {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	return Response.json(await listWorkbooks(gate.userId));
}

const createSchema = z.object({
	name: z.string().min(1).max(200),
	// IronCalc-native bytes produced by the browser engine, base64-encoded.
	bytes: z.base64(),
	// Set when the workbook was imported from Google Sheets — establishes the
	// 1:1 link so "Save to Google Sheets" writes back to the same spreadsheet.
	googleSpreadsheetId: z
		.string()
		.regex(/^[a-zA-Z0-9_-]{20,120}$/)
		.optional(),
});

export async function POST(request: Request) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const parsed = createSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
	}
	const meta = await createWorkbook({
		// Owner always comes from the session, never the request body.
		userId: gate.userId,
		name: parsed.data.name,
		bytes: Uint8Array.from(Buffer.from(parsed.data.bytes, "base64")),
		googleSpreadsheetId: parsed.data.googleSpreadsheetId,
	});
	return Response.json(meta, { status: 201 });
}

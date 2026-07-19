import { requireApiUser } from "@/lib/session";
import { restoreWorkbook } from "@/lib/workbooks";

type Params = { params: Promise<{ id: string }> };

// Bring a trashed workbook back to the live list. 404 if it isn't the caller's
// or isn't actually in the trash.
export async function POST(_request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { id } = await params;
	const restored = await restoreWorkbook(id, gate.userId);
	if (!restored) return Response.json({ error: "not found" }, { status: 404 });
	return new Response(null, { status: 204 });
}

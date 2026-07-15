import { requireApiUser } from "@/lib/session";
import { getWorkbookBytes, saveWorkbookBytes } from "@/lib/workbooks";

type Params = { params: Promise<{ id: string }> };

// 32 MiB — far above any realistic in-browser workbook blob; guards against
// accidental giant uploads until quotas exist.
const MAX_BYTES = 32 * 1024 * 1024;

// This route serves and overwrites raw workbook content, so it is the one that
// mattered most: both handlers scope by owner.

export async function GET(_request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { id } = await params;
	const bytes = await getWorkbookBytes(id, gate.userId);
	if (!bytes) return Response.json({ error: "not found" }, { status: 404 });
	return new Response(Buffer.from(bytes), {
		headers: {
			"content-type": "application/octet-stream",
			"cache-control": "no-store",
		},
	});
}

export async function PUT(request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { id } = await params;
	const body = await request.arrayBuffer();
	if (body.byteLength === 0) {
		return Response.json({ error: "empty body" }, { status: 400 });
	}
	if (body.byteLength > MAX_BYTES) {
		return Response.json({ error: "workbook too large" }, { status: 413 });
	}
	const meta = await saveWorkbookBytes(id, gate.userId, new Uint8Array(body));
	if (!meta) return Response.json({ error: "not found" }, { status: 404 });
	return Response.json(meta);
}

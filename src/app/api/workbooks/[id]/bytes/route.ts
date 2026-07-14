import { requireApiSession } from "@/lib/session";
import { getWorkbookBytes, saveWorkbookBytes } from "@/lib/workbooks";

type Params = { params: Promise<{ id: string }> };

// 32 MiB — far above any realistic in-browser workbook blob; guards the common
// workspace against accidental giant uploads until auth/quotas exist.
const MAX_BYTES = 32 * 1024 * 1024;

export async function GET(_request: Request, { params }: Params) {
	const denied = await requireApiSession();
	if (denied) return denied;
	const { id } = await params;
	const bytes = await getWorkbookBytes(id);
	if (!bytes) return Response.json({ error: "not found" }, { status: 404 });
	return new Response(Buffer.from(bytes), {
		headers: {
			"content-type": "application/octet-stream",
			"cache-control": "no-store",
		},
	});
}

export async function PUT(request: Request, { params }: Params) {
	const denied = await requireApiSession();
	if (denied) return denied;
	const { id } = await params;
	const body = await request.arrayBuffer();
	if (body.byteLength === 0) {
		return Response.json({ error: "empty body" }, { status: 400 });
	}
	if (body.byteLength > MAX_BYTES) {
		return Response.json({ error: "workbook too large" }, { status: 413 });
	}
	const meta = await saveWorkbookBytes(id, new Uint8Array(body));
	if (!meta) return Response.json({ error: "not found" }, { status: 404 });
	return Response.json(meta);
}

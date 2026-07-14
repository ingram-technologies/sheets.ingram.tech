import { z } from "zod";

import { requireApiSession } from "@/lib/session";
import { deleteWorkbook, getWorkbookMeta, renameWorkbook } from "@/lib/workbooks";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
	const denied = await requireApiSession();
	if (denied) return denied;
	const { id } = await params;
	const meta = await getWorkbookMeta(id);
	if (!meta) return Response.json({ error: "not found" }, { status: 404 });
	return Response.json(meta);
}

const patchSchema = z.object({ name: z.string().min(1).max(200) });

export async function PATCH(request: Request, { params }: Params) {
	const denied = await requireApiSession();
	if (denied) return denied;
	const { id } = await params;
	const parsed = patchSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
	}
	const meta = await renameWorkbook(id, parsed.data.name);
	if (!meta) return Response.json({ error: "not found" }, { status: 404 });
	return Response.json(meta);
}

export async function DELETE(_request: Request, { params }: Params) {
	const denied = await requireApiSession();
	if (denied) return denied;
	const { id } = await params;
	const deleted = await deleteWorkbook(id);
	if (!deleted) return Response.json({ error: "not found" }, { status: 404 });
	return new Response(null, { status: 204 });
}

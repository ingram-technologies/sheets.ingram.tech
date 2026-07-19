import { z } from "zod";

import { requireApiUser } from "@/lib/session";
import {
	deleteWorkbookPermanently,
	getWorkbookMeta,
	renameWorkbook,
	trashWorkbook,
} from "@/lib/workbooks";

type Params = { params: Promise<{ id: string }> };

// Every handler scopes by the session's user id. A workbook owned by someone
// else answers 404, not 403 — a 403 would confirm the id exists.

export async function GET(_request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { id } = await params;
	const meta = await getWorkbookMeta(id, gate.userId);
	if (!meta) return Response.json({ error: "not found" }, { status: 404 });
	return Response.json(meta);
}

const patchSchema = z.object({ name: z.string().min(1).max(200) });

export async function PATCH(request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { id } = await params;
	const parsed = patchSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
	}
	const meta = await renameWorkbook(id, gate.userId, parsed.data.name);
	if (!meta) return Response.json({ error: "not found" }, { status: 404 });
	return Response.json(meta);
}

export async function DELETE(request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { id } = await params;
	// Default: move to trash (recoverable). `?permanent=true` erases a workbook
	// that is already in the trash — a live one can't be destroyed in one step.
	const permanent = new URL(request.url).searchParams.get("permanent") === "true";
	const done = permanent
		? await deleteWorkbookPermanently(id, gate.userId)
		: await trashWorkbook(id, gate.userId);
	if (!done) return Response.json({ error: "not found" }, { status: 404 });
	return new Response(null, { status: 204 });
}

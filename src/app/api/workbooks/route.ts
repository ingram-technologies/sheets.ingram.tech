import { nanoid } from "nanoid";
import { z } from "zod";

import { requireApiSession } from "@/lib/session";
import { createWorkbook, listWorkbooks } from "@/lib/workbooks";

export async function GET() {
	const denied = await requireApiSession();
	if (denied) return denied;
	return Response.json(await listWorkbooks());
}

const createSchema = z.object({
	name: z.string().min(1).max(200),
	// IronCalc-native bytes produced by the browser engine, base64-encoded.
	bytes: z.base64(),
});

export async function POST(request: Request) {
	const denied = await requireApiSession();
	if (denied) return denied;
	const parsed = createSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: z.treeifyError(parsed.error) }, { status: 400 });
	}
	const meta = await createWorkbook({
		id: nanoid(12),
		name: parsed.data.name,
		bytes: Uint8Array.from(Buffer.from(parsed.data.bytes, "base64")),
	});
	return Response.json(meta, { status: 201 });
}

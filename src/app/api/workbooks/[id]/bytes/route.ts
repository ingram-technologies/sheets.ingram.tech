import { requireApiUser } from "@/lib/session";
import { getWorkbookForEdit, saveWorkbookBytes } from "@/lib/workbooks";

type Params = { params: Promise<{ id: string }> };

// 32 MiB — far above any realistic in-browser workbook blob; guards against
// accidental giant uploads until quotas exist.
const MAX_BYTES = 32 * 1024 * 1024;

// This route serves and overwrites raw workbook content, so it is the one that
// mattered most: both handlers scope by owner.
//
// Writes are conditional. A workbook now has two writers — this route (the
// browser's autosave) and the MCP endpoint (Claude Code, possibly with no tab
// open) — and a PUT replaces the whole blob, so an unconditional write would
// silently discard whatever the other did. The version travels as an ETag, and
// a PUT must carry it back in `If-Match`.

/** The workbook version as a strong ETag: version 3 -> `"3"`. */
function etag(version: number): string {
	return `"${version}"`;
}

/** Parse `If-Match: "3"` back to 3. Null for absent/garbage/`*`. */
function parseIfMatch(header: string | null): number | null {
	if (!header) return null;
	const match = /^"(\d+)"$/.exec(header.trim());
	if (!match?.[1]) return null;
	return Number(match[1]);
}

export async function GET(_request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { id } = await params;
	const found = await getWorkbookForEdit(id, gate.userId);
	if (!found) return Response.json({ error: "not found" }, { status: 404 });
	return new Response(Buffer.from(found.bytes), {
		headers: {
			"content-type": "application/octet-stream",
			"cache-control": "no-store",
			// The client holds onto this and sends it back on PUT.
			etag: etag(found.meta.version),
		},
	});
}

export async function PUT(request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { id } = await params;

	// Refusing an unconditional write is the point: a client that does not
	// track the version cannot participate safely, and failing loudly here is
	// far cheaper than diagnosing lost edits later.
	const expectedVersion = parseIfMatch(request.headers.get("if-match"));
	if (expectedVersion === null) {
		return Response.json(
			{ error: "if-match required", detail: "PUT must carry the ETag from GET." },
			{ status: 428 },
		);
	}

	const body = await request.arrayBuffer();
	if (body.byteLength === 0) {
		return Response.json({ error: "empty body" }, { status: 400 });
	}
	if (body.byteLength > MAX_BYTES) {
		return Response.json({ error: "workbook too large" }, { status: 413 });
	}

	const result = await saveWorkbookBytes(
		id,
		gate.userId,
		new Uint8Array(body),
		expectedVersion,
	);
	if (!result.ok && result.reason === "not_found") {
		return Response.json({ error: "not found" }, { status: 404 });
	}
	if (!result.ok) {
		// Someone else wrote first. The current meta comes back so the client
		// can re-read the bytes and reapply rather than guess.
		return Response.json(
			{ error: "version conflict", meta: result.meta },
			{ status: 412, headers: { etag: etag(result.meta.version) } },
		);
	}
	return Response.json(result.meta, {
		headers: { etag: etag(result.meta.version) },
	});
}

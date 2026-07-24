import { withMcpAuth } from "better-auth/plugins";

import { auth } from "@/lib/auth";
import { handleRpc } from "@/lib/mcp/server";

/**
 * The MCP endpoint: `claude mcp add --transport http sheets
 * https://sheets.ingram.tech/api/mcp`.
 *
 * Lives under /api because that is exactly what it is — the app's public API,
 * consumed by an external client. (Contrast /internal, which is for callers
 * the public never is: webhooks, crons, provider callbacks.)
 *
 * Stateless streamable-HTTP: one JSON-RPC request per POST, one JSON response,
 * no server-held session. What would normally live in protocol state — which
 * workbook is open — travels in each tool call's `workbook_id` instead, so
 * concurrent clients and retries need no coordination.
 *
 * `withMcpAuth` resolves the bearer token to an OAuth grant and answers 401
 * with the `WWW-Authenticate` challenge MCP clients follow to discover the
 * authorization server. The user id comes from that grant and nowhere else —
 * never from the request body — which is what keeps every tool owner-scoped.
 */

export const POST = withMcpAuth(auth, async (request, session) => {
	let message: unknown;
	try {
		message = await request.json();
	} catch {
		return Response.json(
			{
				jsonrpc: "2.0",
				id: null,
				error: { code: -32700, message: "Parse error" },
			},
			{ status: 400 },
		);
	}

	const response = await handleRpc(message, session.userId);
	// A JSON-RPC notification gets no reply body; 202 says "accepted, nothing
	// to say" without inventing a result the client would try to match to a
	// request id it never sent.
	if (response === null) return new Response(null, { status: 202 });
	return Response.json(response);
});

/**
 * MCP clients probe with GET to discover whether the endpoint upgrades to a
 * server-sent event stream. This one does not — every response is a complete
 * JSON body — and 405 is the spec's way of saying so, which clients handle by
 * falling back to plain POST.
 */
export function GET() {
	return Response.json(
		{ error: "This MCP endpoint is POST-only (stateless JSON responses)." },
		{ status: 405, headers: { allow: "POST" } },
	);
}

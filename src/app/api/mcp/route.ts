import { requireMcpAuth } from "@better-auth/mcp";

import { auth, mcpResource } from "@/lib/auth";
import { hasConsent } from "@/lib/connected-apps";
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
 * `requireMcpAuth` verifies the bearer token (a JWT bound to this resource)
 * against our JWKS and answers 401 with the `WWW-Authenticate` challenge MCP
 * clients follow to discover the authorization server. The user id is the
 * token's `sub` and comes from nowhere else — never from the request body —
 * which is what keeps every tool owner-scoped.
 */

/** Where a client re-discovers how to sign in (RFC 9728 path form). */
const RESOURCE_METADATA = (() => {
	const url = new URL(mcpResource);
	return `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
})();

const handler = async (request: Request, userId: string): Promise<Response> => {
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

	const response = await handleRpc(message, userId);
	// A JSON-RPC notification gets no reply body; 202 says "accepted, nothing
	// to say" without inventing a result the client would try to match to a
	// request id it never sent.
	if (response === null) return new Response(null, { status: 202 });
	return Response.json(response);
};

export const POST = requireMcpAuth(
	auth,
	async (request, claims) => {
		// A verified token always names its user and its app; refuse one that
		// somehow does not rather than run tools for nobody.
		const userId = claims.sub;
		const clientId = claims.azp ?? claims.client_id;
		if (typeof userId !== "string" || typeof clientId !== "string") {
			return Response.json({ error: "token has no subject" }, { status: 401 });
		}
		// The signature says the token was issued; only the consent says it is
		// still wanted. Disconnecting an app in Connected apps removes the
		// consent, and this is where that bites (see lib/connected-apps).
		if (!(await hasConsent(userId, clientId))) {
			return Response.json(
				{ error: "this app was disconnected" },
				{
					status: 401,
					headers: {
						"www-authenticate": `Bearer error="invalid_token", resource_metadata="${RESOURCE_METADATA}"`,
					},
				},
			);
		}
		return handler(request, userId);
	},
	{ resource: mcpResource },
);

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

import { z } from "zod";

/**
 * Just enough of the Model Context Protocol to serve tools over HTTP.
 *
 * Hand-rolled rather than pulled from an SDK, for two reasons. The transport
 * we need is the stateless one — every request is a self-contained JSON-RPC
 * call answered with a JSON response, with session affinity carried in the
 * `workbook_id` argument rather than in protocol state — which is a few dozen
 * lines. And the SDK's HTTP transport wants Node req/res objects, which a
 * Next route handler does not have; adapting it is more code than this, and
 * more to be wrong about.
 *
 * If this endpoint ever needs server-initiated messages (sampling,
 * notifications, progress), that trade flips and the SDK becomes the right
 * answer. Tools alone do not need them.
 */

/** Protocol revision this server implements. */
export const PROTOCOL_VERSION = "2025-06-18";

export const jsonRpcRequestSchema = z.object({
	jsonrpc: z.literal("2.0"),
	// Absent on notifications, which expect no reply.
	id: z.union([z.string(), z.number()]).nullish(),
	method: z.string(),
	params: z.unknown().optional(),
});

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

/** JSON-RPC error codes, plus the one MCP-specific case we raise. */
export const RpcError = {
	parse: -32700,
	invalidRequest: -32600,
	methodNotFound: -32601,
	invalidParams: -32602,
	internal: -32603,
} as const;

export function rpcResult(id: JsonRpcRequest["id"], result: unknown) {
	return { jsonrpc: "2.0" as const, id: id ?? null, result };
}

export function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
	return { jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } };
}

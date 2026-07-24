import { z } from "zod";

import {
	type JsonRpcRequest,
	jsonRpcRequestSchema,
	PROTOCOL_VERSION,
	RpcError,
	rpcError,
	rpcResult,
} from "./jsonrpc";
import { type ToolName, runTool, toolDescriptions, toolSchemas } from "./tools";

/**
 * MCP method dispatch, independent of HTTP so it can be driven directly from
 * tests.
 *
 * Returns `null` for JSON-RPC notifications — messages with no `id`, which by
 * spec must not be answered. The route turns that into 202 with no body.
 */

const toolNames = Object.keys(toolSchemas) as ToolName[];

function toolList() {
	return {
		tools: toolNames.map((name) => ({
			name,
			description: toolDescriptions[name],
			// MCP wants JSON Schema; the zod schemas stay the single source of
			// truth for both the advertised shape and the runtime validation
			// below, so the two cannot drift apart.
			inputSchema: z.toJSONSchema(toolSchemas[name]),
		})),
	};
}

const callParamsSchema = z.object({
	name: z.string(),
	arguments: z.unknown().optional(),
});

export async function handleRpc(
	message: unknown,
	userId: string,
): Promise<object | null> {
	const parsed = jsonRpcRequestSchema.safeParse(message);
	if (!parsed.success) {
		return rpcError(null, RpcError.invalidRequest, "Not a JSON-RPC 2.0 request");
	}
	const request: JsonRpcRequest = parsed.data;
	const isNotification = request.id === undefined || request.id === null;

	switch (request.method) {
		case "initialize":
			return rpcResult(request.id, {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: { name: "sheets.ingram.tech", version: "1.0.0" },
			});

		case "notifications/initialized":
		case "notifications/cancelled":
			return null;

		case "ping":
			return rpcResult(request.id, {});

		case "tools/list":
			return rpcResult(request.id, toolList());

		case "tools/call": {
			const params = callParamsSchema.safeParse(request.params);
			if (!params.success) {
				return rpcError(
					request.id,
					RpcError.invalidParams,
					"Missing tool name",
				);
			}
			const name = params.data.name;
			if (!isToolName(name)) {
				return rpcError(request.id, RpcError.methodNotFound, `No tool ${name}`);
			}
			const args = toolSchemas[name].safeParse(params.data.arguments ?? {});
			if (!args.success) {
				return rpcError(
					request.id,
					RpcError.invalidParams,
					z.prettifyError(args.error),
				);
			}
			try {
				const result = await runTool(name, args.data, userId);
				// A tool that fails is reported *inside* a successful result, per
				// MCP: the model is meant to read the failure and correct itself,
				// which a protocol-level error would deny it.
				return rpcResult(request.id, {
					content: [{ type: "text", text: result.text }],
					isError: result.isError ?? false,
				});
			} catch (error) {
				return rpcError(
					request.id,
					RpcError.internal,
					error instanceof Error ? error.message : String(error),
				);
			}
		}

		default:
			if (isNotification) return null;
			return rpcError(
				request.id,
				RpcError.methodNotFound,
				`Unsupported method ${request.method}`,
			);
	}
}

function isToolName(name: string): name is ToolName {
	return Object.hasOwn(toolSchemas, name);
}

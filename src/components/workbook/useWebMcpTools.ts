"use client";

import { useEffect } from "react";
import { z } from "zod";

import {
	AGENT_TOOL_DESCRIPTIONS,
	type AgentToolName,
	agentToolSchemas,
} from "@/lib/agent-tools";
import { registerWebMcpTools } from "@/lib/webmcp";

import { summarize, type WebMcpCall } from "./webmcp-log";

import { AgentExecutor } from "./agent-executor";
import type { WorkbookController } from "./controller";

/**
 * Publish the workbook's tools to the agent driving the browser, for as long
 * as this workbook is open.
 *
 * Same executor the chat panel drives, so an outside agent gets the same
 * presence choreography — focus marks, pulses, the recalc delta echo — and its
 * writes land on the controller, which means autosave's compare-and-swap
 * carries them exactly as a human keystroke would.
 *
 * A visiting agent arrives cold: no system prompt, no injected workbook sketch,
 * only what the descriptors say. Hence the entry-point sentence below — the
 * rest of the conventions already ride in the Zod field descriptions.
 */

/**
 * Tools that leave the workbook exactly as they found it, so the host can run
 * them without asking. `highlight_cells` counts: it points the user at a range
 * and writes nothing.
 */
const READ_ONLY = new Set<AgentToolName>([
	"get_workbook_overview",
	"read_range",
	"highlight_cells",
]);

/**
 * Tools whose results carry cell contents the user typed. A cell can hold any
 * text at all, including something shaped like an instruction, so the agent is
 * told up front that this is data.
 */
const RETURNS_USER_CONTENT = new Set<AgentToolName>([
	"get_workbook_overview",
	"read_range",
]);

const COLD_START =
	"You are operating a live spreadsheet the user is looking at in Ingram Sheets; edits appear in their grid immediately. Cells are addressed A1-style and sheets by name. Call this before anything else to learn the sheets, their used ranges and headers.";

export function useWebMcpTools(
	controller: WorkbookController | null,
	renameDocument: (name: string) => Promise<boolean>,
	/** Notified after every call, so the page can show what was done to it. */
	onCall?: (call: Omit<WebMcpCall, "id">) => void,
): void {
	useEffect(() => {
		if (!controller) return;
		const executor = new AgentExecutor(controller, renameDocument);
		const teardown = new AbortController();
		const names = Object.keys(agentToolSchemas) as AgentToolName[];
		registerWebMcpTools(
			names.map((name) => ({
				name,
				description:
					name === "get_workbook_overview"
						? COLD_START
						: AGENT_TOOL_DESCRIPTIONS[name],
				// Input mode, so a field with a default reads as optional — the
				// agent shouldn't have to supply `what` or `count` to get the
				// behaviour the schema already promises.
				inputSchema: z.toJSONSchema(agentToolSchemas[name], { io: "input" }),
				annotations: {
					readOnlyHint: READ_ONLY.has(name),
					untrustedContentHint: RETURNS_USER_CONTENT.has(name),
				},
				// The host stringifies whatever comes back, so answer with the
				// executor's text verbatim — wrapping it in MCP content blocks
				// would reach the agent as JSON noise around the grid.
				execute: async (input: Record<string, unknown>) => {
					const result = await executor.execute(name, input);
					onCall?.(summarize(name, input, result));
					return result;
				},
			})),
			teardown.signal,
		);
		return () => teardown.abort();
	}, [controller, renameDocument, onCall]);
}

import { anthropic } from "@ai-sdk/anthropic";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { z } from "zod";

import { AGENT_TOOL_DESCRIPTIONS, agentToolSchemas } from "@/lib/agent-tools";

export const maxDuration = 120;

// Direct Anthropic API (ANTHROPIC_API_KEY); model overridable via env.
const MODEL = process.env.SHEETS_CHAT_MODEL ?? "claude-opus-4-8";

const SYSTEM_PROMPT = `You are the spreadsheet agent of sheets.ingram.tech, working live inside the user's workbook. The user sees your cursor, highlights, and every cell you touch in real time.

How to work:
- Each user message arrives with a fresh <current_workbook_state> sketch auto-attached (the user may edit cells between turns — trust the attached state over older history). Call get_workbook_overview only when you need to re-check state mid-task.
- Every mutation returns a recalc delta (every cell whose computed value changed, including formula ripple). Trust it — you never need to re-read a range after editing it.
- Cell inputs are exactly what a user would type: formulas start with '=', numbers are bare, everything else is text. Use A1 references.
- Prefer one set_cells block over many single-cell writes; prefer fill_range to extend a formula down a column.
- After non-trivial work, read back a small checking range (a total, a spot check) to verify the result, and say what you verified.
- Use highlight_cells to point at specific cells when flagging anomalies or asking the user a question about them.
- If a tool returns an error, adapt — don't repeat the identical call.
- Be concise in prose. The user watches the grid; narrate the outcome, not each step.`;

const bodySchema = z.object({
	messages: z.array(z.unknown()),
	// Fresh workbook sketch computed by the browser engine at send time.
	overview: z.string().max(20000).optional(),
});

export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}
	// UIMessage[] is structurally validated by convertToModelMessages below.
	const messages = messagesAsUi(parsed.data.messages);

	const result = streamText({
		model: anthropic(MODEL),
		system: SYSTEM_PROMPT,
		messages: await convertToModelMessages(
			withWorkbookState(messages, parsed.data.overview),
		),
		stopWhen: stepCountIs(24),
		// All tools execute client-side against the in-browser engine — no
		// execute functions here; calls are forwarded to the browser.
		tools: {
			get_workbook_overview: {
				description: AGENT_TOOL_DESCRIPTIONS.get_workbook_overview,
				inputSchema: agentToolSchemas.get_workbook_overview,
			},
			read_range: {
				description: AGENT_TOOL_DESCRIPTIONS.read_range,
				inputSchema: agentToolSchemas.read_range,
			},
			set_cells: {
				description: AGENT_TOOL_DESCRIPTIONS.set_cells,
				inputSchema: agentToolSchemas.set_cells,
			},
			fill_range: {
				description: AGENT_TOOL_DESCRIPTIONS.fill_range,
				inputSchema: agentToolSchemas.fill_range,
			},
			clear_range: {
				description: AGENT_TOOL_DESCRIPTIONS.clear_range,
				inputSchema: agentToolSchemas.clear_range,
			},
			format_range: {
				description: AGENT_TOOL_DESCRIPTIONS.format_range,
				inputSchema: agentToolSchemas.format_range,
			},
			modify_structure: {
				description: AGENT_TOOL_DESCRIPTIONS.modify_structure,
				inputSchema: agentToolSchemas.modify_structure,
			},
			add_sheet: {
				description: AGENT_TOOL_DESCRIPTIONS.add_sheet,
				inputSchema: agentToolSchemas.add_sheet,
			},
			rename_sheet: {
				description: AGENT_TOOL_DESCRIPTIONS.rename_sheet,
				inputSchema: agentToolSchemas.rename_sheet,
			},
			undo: {
				description: AGENT_TOOL_DESCRIPTIONS.undo,
				inputSchema: agentToolSchemas.undo,
			},
			highlight_cells: {
				description: AGENT_TOOL_DESCRIPTIONS.highlight_cells,
				inputSchema: agentToolSchemas.highlight_cells,
			},
		},
	});

	return result.toUIMessageStreamResponse({
		// Surface the real failure to the chat panel instead of the SDK's
		// masked default ("An error occurred.") — this app has no third-party
		// users yet and gateway errors (billing tier, model access, rate
		// limits) are exactly what the person in front of it needs to see.
		onError: (error) =>
			error instanceof Error ? error.message : "Chat failed — check server logs.",
	});
}

function messagesAsUi(messages: unknown[]): UIMessage[] {
	// convertToModelMessages validates structure and throws on malformed
	// input; this narrowing just satisfies the type boundary.
	return messages.filter(
		(message): message is UIMessage =>
			typeof message === "object" && message !== null && "role" in message,
	);
}

/**
 * Attach the fresh workbook sketch to the latest plain user turn (per-request
 * only — it is never persisted into the client's message history, so each
 * request carries exactly one, current, sketch). Injecting here instead of
 * the system prompt keeps the cacheable prompt prefix byte-stable. Tool-loop
 * continuations (last user message is tool results) are left untouched — the
 * agent already tracks its own edits via delta echoes mid-task.
 */
function withWorkbookState(messages: UIMessage[], overview?: string): UIMessage[] {
	if (!overview) return messages;
	const last = messages[messages.length - 1];
	if (!last || last.role !== "user") return messages;
	if (!last.parts.some((part) => part.type === "text")) return messages;
	const annotated: UIMessage = {
		...last,
		parts: [
			...last.parts,
			{
				type: "text",
				text: `\n\n<current_workbook_state>\n${overview}\n</current_workbook_state>`,
			},
		],
	};
	return [...messages.slice(0, -1), annotated];
}

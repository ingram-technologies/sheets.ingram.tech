import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { z } from "zod";

import { AGENT_TOOL_DESCRIPTIONS, agentToolSchemas } from "@/lib/agent-tools";

export const maxDuration = 120;

// AI Gateway model string ("provider/model"); override via env.
const MODEL = process.env.SHEETS_CHAT_MODEL ?? "anthropic/claude-opus-4.8";

const SYSTEM_PROMPT = `You are the spreadsheet agent of sheets.ingram.tech, working live inside the user's workbook. The user sees your cursor, highlights, and every cell you touch in real time.

How to work:
- Start by calling get_workbook_overview unless you already know the workbook's state from this conversation.
- Every mutation returns a recalc delta (every cell whose computed value changed, including formula ripple). Trust it — you never need to re-read a range after editing it.
- Cell inputs are exactly what a user would type: formulas start with '=', numbers are bare, everything else is text. Use A1 references.
- Prefer one set_cells block over many single-cell writes; prefer fill_range to extend a formula down a column.
- After non-trivial work, read back a small checking range (a total, a spot check) to verify the result, and say what you verified.
- Use highlight_cells to point at specific cells when flagging anomalies or asking the user a question about them.
- If a tool returns an error, adapt — don't repeat the identical call.
- Be concise in prose. The user watches the grid; narrate the outcome, not each step.`;

const bodySchema = z.object({
	messages: z.array(z.unknown()),
});

export async function POST(request: Request) {
	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}
	// UIMessage[] is structurally validated by convertToModelMessages below.
	const messages = parsed.data.messages;

	const result = streamText({
		model: MODEL,
		system: SYSTEM_PROMPT,
		messages: await convertToModelMessages(messagesAsUi(messages)),
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

	return result.toUIMessageStreamResponse();
}

function messagesAsUi(messages: unknown[]): UIMessage[] {
	// convertToModelMessages validates structure and throws on malformed
	// input; this narrowing just satisfies the type boundary.
	return messages.filter(
		(message): message is UIMessage =>
			typeof message === "object" && message !== null && "role" in message,
	);
}

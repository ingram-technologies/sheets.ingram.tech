import { createIngramCloud } from "@ingram-cloud/ai-sdk";
import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { z } from "zod";

import { AGENT_TOOL_DESCRIPTIONS, agentToolSchemas } from "@/lib/agent-tools";
import { icShimFetch } from "@/lib/ic-stream-shim";
import { smithExternalId } from "@/lib/ingram-cloud";
import { requireApiUser } from "@/lib/session";

export const maxDuration = 120;

// Ingram Cloud runs inference — hosted keys by default, or the user's own key
// when they've attached one to their smith (see lib/ingram-cloud.ts). ""
// means the IC agent's configured model (claude-opus-4-8, owned by the sheets
// Pulumi stack); set SHEETS_CHAT_MODEL to override per-deployment.
const MODEL = process.env.SHEETS_CHAT_MODEL ?? "";

const SYSTEM_PROMPT = `You are the spreadsheet agent of sheets.ingram.tech, working live inside the user's workbook. The user sees your cursor, highlights, and every cell you touch in real time.

How to work:
- Each user message arrives with a fresh <current_workbook_state> sketch auto-attached (the user may edit cells between turns — trust the attached state over older history). Call get_workbook_overview only when you need to re-check state mid-task.
- A <user_edits_since_last_turn> block may also be attached: cells the user changed by hand since your previous turn. The workbook state already reflects them. It is awareness, not a request — never revert or re-apply those edits, and don't comment on them unless they affect the task at hand.
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
	// Cells the user changed by hand since the agent's last turn (the
	// user-delta echo) — context for the agent, never an instruction.
	userEdits: z.string().max(6000).optional(),
});

export async function POST(request: Request) {
	// Sign-in gate only: this route touches no workbook rows. The tools run in
	// the caller's own browser against their own loaded model, and the sketch
	// arrives in the body — so there is nothing here to scope by owner.
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}
	// UIMessage[] is structurally validated by convertToModelMessages below.
	const messages = messagesAsUi(parsed.data.messages);

	// Tenant token + IC-Agent-Id + the `user` field below: Ingram Cloud lazily
	// provisions one smith per (user, agent) — no provisioning code here. Turns
	// stay stateless (no threadId): the messages we send are the whole context,
	// and the browser owns the history exactly as before the port.
	const ingram = createIngramCloud({
		apiKey: process.env.INGRAM_CLOUD_TOKEN ?? "",
		headers: { "IC-Agent-Id": process.env.IC_AGENT_ID ?? "" },
		// Temporary SSE normalizer — see src/lib/ic-stream-shim.ts.
		fetch: icShimFetch,
	});

	const result = streamText({
		model: ingram(MODEL),
		// Appended to the IC agent's instructions — which are empty on purpose,
		// so this stays the entire prompt (cloud.ingram.tech#163).
		system: SYSTEM_PROMPT,
		messages: await convertToModelMessages(
			withWorkbookState(messages, parsed.data.overview, parsed.data.userEdits),
		),
		// Single-sourced with the management-plane `external_id` so a BYOK key set
		// on the smith and this run resolve to the SAME smith (cloud#170).
		providerOptions: { openai: { user: smithExternalId(gate.userId) } },
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
			rename_workbook: {
				description: AGENT_TOOL_DESCRIPTIONS.rename_workbook,
				inputSchema: agentToolSchemas.rename_workbook,
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
 * Attach the fresh workbook sketch — and, when present, the user-delta echo —
 * to the latest plain user turn (per-request only; neither is persisted into
 * the client's message history, so each request carries exactly one, current,
 * set). Injecting here instead of the system prompt keeps the cacheable
 * prompt prefix byte-stable. Tool-loop continuations (last user message is
 * tool results) are left untouched — the agent already tracks its own edits
 * via delta echoes mid-task.
 */
function withWorkbookState(
	messages: UIMessage[],
	overview?: string,
	userEdits?: string,
): UIMessage[] {
	const blocks: string[] = [];
	if (userEdits) {
		blocks.push(
			`<user_edits_since_last_turn>\n${userEdits}\n</user_edits_since_last_turn>`,
		);
	}
	if (overview) {
		blocks.push(`<current_workbook_state>\n${overview}\n</current_workbook_state>`);
	}
	if (blocks.length === 0) return messages;
	const last = messages[messages.length - 1];
	if (!last || last.role !== "user") return messages;
	if (!last.parts.some((part) => part.type === "text")) return messages;
	const annotated: UIMessage = {
		...last,
		parts: [...last.parts, { type: "text", text: `\n\n${blocks.join("\n\n")}` }],
	};
	return [...messages.slice(0, -1), annotated];
}

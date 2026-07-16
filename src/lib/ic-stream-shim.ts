/**
 * TEMPORARY — Ingram Cloud `/v1/responses` SSE normalizer. Delete when
 * cloud.ingram.tech ships granular Responses stream events (tracked in the
 * follow-up to cloud.ingram.tech#163).
 *
 * IC currently streams only item-level events: `response.output_item.added/
 * .done` carry complete items, with no granular delta events at all. The AI
 * SDK's Responses parser (@ai-sdk/openai, used under @ingram-cloud/ai-sdk)
 * needs two things that stream doesn't provide:
 *
 *   1. `status: "completed"` on `function_call` items in `output_item.done` —
 *      the parser's schema requires the literal, so without it the chunk
 *      fails validation and the tool call is silently dropped (the agent's
 *      cursor would never move: every spreadsheet edit is a tool call).
 *   2. `response.output_text.delta` events — the parser never reads
 *      item-level message content, so assistant text renders empty.
 *
 * This fetch wrapper rewrites the SSE stream in flight: it stamps the missing
 * status onto function_call items and synthesizes one text delta per
 * completed message item. Everything else passes through byte-identical.
 */

type SseJson = { [key: string]: unknown };

function isRecord(value: unknown): value is SseJson {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asObject(value: unknown): SseJson | undefined {
	return isRecord(value) ? value : undefined;
}

/** Rewrite one parsed SSE `data:` payload; returns extra blocks to emit first. */
function normalizeEvent(event: SseJson): { prepend: string[] } {
	const prepend: string[] = [];
	const type = event.type;
	const item = asObject(event.item);
	if (!item) return { prepend };

	if (
		(type === "response.output_item.done" ||
			type === "response.output_item.added") &&
		item.type === "function_call" &&
		item.status === undefined
	) {
		item.status = "completed";
	}

	if (type === "response.output_item.done" && item.type === "message") {
		const content = Array.isArray(item.content) ? item.content : [];
		for (const part of content) {
			const block = asObject(part);
			if (block?.type !== "output_text" || typeof block.text !== "string")
				continue;
			if (block.text === "") continue;
			const delta = {
				type: "response.output_text.delta",
				item_id: item.id,
				delta: block.text,
			};
			prepend.push(
				`event: response.output_text.delta\ndata: ${JSON.stringify(delta)}\n\n`,
			);
		}
	}

	return { prepend };
}

/** Rewrite one full SSE block (`event:`/`data:` lines, no trailing \n\n). */
function normalizeBlock(block: string): string {
	const lines = block.split("\n");
	const dataLine = lines.find((line) => line.startsWith("data: "));
	if (dataLine === undefined) return `${block}\n\n`;
	const dataIndex = lines.indexOf(dataLine);
	let parsed: unknown;
	try {
		parsed = JSON.parse(dataLine.slice("data: ".length));
	} catch {
		return `${block}\n\n`;
	}
	const event = asObject(parsed);
	if (!event) return `${block}\n\n`;
	const { prepend } = normalizeEvent(event);
	lines[dataIndex] = `data: ${JSON.stringify(event)}`;
	return `${prepend.join("")}${lines.join("\n")}\n\n`;
}

function normalizeSseStream(
	body: ReadableStream<Uint8Array>,
): ReadableStream<Uint8Array> {
	const decoder = new TextDecoder();
	const encoder = new TextEncoder();
	let buffer = "";
	return body.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true });
				const blocks = buffer.split("\n\n");
				buffer = blocks.pop() ?? "";
				for (const block of blocks) {
					controller.enqueue(encoder.encode(normalizeBlock(block)));
				}
			},
			flush(controller) {
				buffer += decoder.decode();
				if (buffer !== "")
					controller.enqueue(encoder.encode(normalizeBlock(buffer)));
			},
		}),
	);
}

export const icShimFetch: typeof globalThis.fetch = async (input, init) => {
	const response = await fetch(input, init);
	const contentType = response.headers.get("content-type") ?? "";
	if (!response.body || !contentType.includes("text/event-stream")) {
		return response;
	}
	return new Response(normalizeSseStream(response.body), {
		status: response.status,
		statusText: response.statusText,
		headers: response.headers,
	});
};

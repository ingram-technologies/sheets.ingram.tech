import { afterEach, describe, expect, it } from "vitest";

import { registerWebMcpTools, webMcpSupported } from "./webmcp";

/**
 * Registration is fire-and-forget against an API the browser may not have, so
 * the failure it can produce is silence: a page that offers no tools looks
 * exactly like an agent that ignored them. Pin that it hands every tool over
 * with the teardown signal, and that it stays inert with no model context.
 */

const tool: WebMcpToolDescriptor = {
	name: "read_range",
	description: "Read a range.",
	inputSchema: { type: "object" },
	execute: async () => "ok",
};

function stubDocument(modelContext: WebMcpModelContext | undefined): void {
	Object.defineProperty(globalThis, "document", {
		value: { modelContext },
		configurable: true,
	});
}

afterEach(() => {
	Reflect.deleteProperty(globalThis, "document");
});

describe("registerWebMcpTools", () => {
	it("hands every tool to the browser with the teardown signal", () => {
		const calls: { name: string; signal?: AbortSignal }[] = [];
		stubDocument({
			registerTool: async (descriptor, options) => {
				calls.push({ name: descriptor.name, signal: options?.signal });
			},
		});
		const teardown = new AbortController();

		expect(registerWebMcpTools([tool], teardown.signal)).toBe(true);
		expect(calls).toEqual([{ name: "read_range", signal: teardown.signal }]);
	});

	it("is inert where the browser has no model context", () => {
		stubDocument(undefined);
		expect(webMcpSupported()).toBe(false);
		expect(registerWebMcpTools([tool], new AbortController().signal)).toBe(false);
	});
});

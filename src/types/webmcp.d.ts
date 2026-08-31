/**
 * WebMCP: the page declares callable tools to whatever agent is driving the
 * browser. Not in TypeScript's DOM lib yet, so the shape is declared here.
 *
 * Verified against Chrome 152 (origin trial, Chrome 149-156): the entry point
 * is `document.modelContext` — `navigator.modelContext`, the original name, is
 * gone — and the host JSON-stringifies whatever `execute` returns, so a tool
 * answers with the text it wants the agent to read and nothing else.
 */

interface WebMcpToolDescriptor {
	name: string;
	description: string;
	/** JSON Schema. The host serializes it; an object is what it wants here. */
	inputSchema: object;
	execute: (input: Record<string, unknown>) => Promise<string>;
	annotations?: {
		/** Does not change the page's state — the host may run it unattended. */
		readOnlyHint?: boolean;
		/** The result carries content the user authored, not the site's own
		 *  words, so the agent should not read it as instructions. */
		untrustedContentHint?: boolean;
	};
}

interface WebMcpModelContext {
	registerTool: (
		tool: WebMcpToolDescriptor,
		options?: { signal?: AbortSignal },
	) => Promise<void>;
}

interface Document {
	readonly modelContext?: WebMcpModelContext;
}

/**
 * WebMCP — the second way the agent can be powered.
 *
 * The chat panel runs a model on the user's own Ingram Cloud organization. The
 * other way round: the user's browser already has an agent, and the page hands
 * it the workbook's tools. Then the model, the turn, and the bill are all on
 * their side and Sheets needs no inference credential at all.
 *
 * Tool *registration* is unconditional wherever the browser supports it — tools
 * are a property of the page, not a user setting. The mode below only decides
 * whether onboarding still nags for an Ingram Cloud link.
 *
 * Reaching real users needs the origin trial token wired in `app/layout.tsx`
 * until WebMCP ships on by default; locally it needs
 * `chrome://flags/#enable-webmcp-testing`.
 */

/** Where the agent's turns run. Absent = not chosen yet. */
export type AgentMode = "ingram-cloud" | "webmcp";

const MODE_KEY = "ingram-sheets.agent.mode.v1";

export function webMcpSupported(): boolean {
	return typeof document !== "undefined" && document.modelContext !== undefined;
}

export function agentMode(): AgentMode | null {
	if (typeof window === "undefined") return null;
	const stored = window.localStorage.getItem(MODE_KEY);
	return stored === "ingram-cloud" || stored === "webmcp" ? stored : null;
}

export function setAgentMode(mode: AgentMode): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(MODE_KEY, mode);
}

/**
 * Offer `tools` to the browser's agent for as long as `signal` is unaborted.
 * Answers whether the browser took them.
 */
export function registerWebMcpTools(
	tools: WebMcpToolDescriptor[],
	signal: AbortSignal,
): boolean {
	const context = typeof document === "undefined" ? undefined : document.modelContext;
	if (!context) return false;
	for (const tool of tools) {
		// Rejects on a duplicate name or a schema the browser won't take. The
		// page still works; the tools just aren't there — so say so rather
		// than leave an unhandled rejection as the only trace.
		context.registerTool(tool, { signal }).catch((error: unknown) => {
			console.error(`WebMCP: ${tool.name} was not registered`, error);
		});
	}
	return true;
}

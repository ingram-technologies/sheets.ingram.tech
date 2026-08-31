/**
 * Client-safe view of how the agent is powered.
 *
 * The server is the source of truth (`src/lib/inference.ts`); this is the
 * shape `GET /api/inference` answers and the setup dialog renders. It never
 * carries the token — only a tail hint and what to do next. Kept free of any
 * server import so it can be used from client components.
 */

export type FundingIssue = "card_required" | "insufficient_credits";

export interface InferenceView {
	/** One-click "Link Ingram Cloud" is offered (SHEETS_OAUTH_PRIVATE_KEY set). */
	linkAvailable: boolean;
	/** The server can store a token at all (SHEETS_CREDENTIALS_KEY set). */
	storageReady: boolean;
	credential: {
		tokenHint: string;
		source: "oauth" | "paste";
		/** IC refused the last turn for lack of funds — and where to fix it,
		 *  when the user linked via OAuth (IC only accepts a return to a
		 *  linked app). */
		funding: { issue: FundingIssue; url: string | null } | null;
		updatedAt: string;
		lastUsedAt: string | null;
		lastError: string | null;
	} | null;
}

/** The answer the chat route gives when the caller has no credential; the
 *  client opens setup on it instead of showing an error. */
export const INFERENCE_NOT_CONFIGURED = "inference_not_configured";

const DEFERRED_KEY = "ingram-sheets.inference.deferred.v1";

/**
 * The user picked "look around first". This suppresses the automatic first-run
 * nudge on the home page — but NOT the gate that re-appears when they try to
 * message the agent — until they actually link.
 */
export function isInferenceDeferred(): boolean {
	if (typeof window === "undefined") return false;
	return window.localStorage.getItem(DEFERRED_KEY) === "1";
}

export function deferInference(): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(DEFERRED_KEY, "1");
}

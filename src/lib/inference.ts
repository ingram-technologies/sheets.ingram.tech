/**
 * Per-user inference credentials — which Ingram Cloud project a user's chat
 * runs (and bills) on.
 *
 * Sheets has no inference key of its own. Each user links their IC
 * organization in one click (`ic-oauth.ts`) or pastes a project token; the
 * token is stored here encrypted at rest, and `loadInference(userId)` turns it
 * into the connection `/api/chat` needs for every turn. No credential → no
 * agent for that user: the route answers 409 and the client opens setup.
 *
 * The Sheets agent lives in the user's project (`ic-agent.ts`). `agentSig`
 * records the spec it was published from; when a deploy moves the spec on,
 * the next `loadInference` reconciles it first.
 *
 * Server-only: this module decrypts tokens. Never import it from a client
 * component — the client-safe view type lives in `./inference-client`.
 */

import "server-only";

import { eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import {
	AGENT_SIG,
	ensureAgent,
	IC_DEFAULT_BASE_URL,
	type IcConnection,
	ICError,
	verifyConnection,
} from "@/lib/ic-agent";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

const { inferenceCredential } = schema;

export type CredentialSource = "oauth" | "paste";

export type InferenceContext = {
	userId: string;
	conn: IcConnection;
	/** `agt_…` of the Sheets agent in the user's project. */
	agentId: string;
	/** The OpenAI `user` field: IC keys one smith per (user, agent). */
	principal: string;
};

/**
 * The identity string that names one user's smith. It rides the ai-sdk
 * `user` field the chat route sends; IC lazily provisions the smith for
 * `(user, agent)` on first touch and reuses it after.
 */
export function smithExternalId(userId: string): string {
	return `user:${userId}`;
}

function hintOf(token: string): string {
	return token.length > 8 ? `…${token.slice(-6)}` : "…";
}

/** A user-facing message for an IC failure — never the raw body (it may echo
 *  request details), always the actionable class of problem. */
export function describeIcError(e: unknown): string {
	if (e instanceof ICError) {
		if (e.status === 401 || e.status === 403) {
			return "Ingram Cloud rejected the token. Check it is a project token (tha_live_…) with full access.";
		}
		if (e.status === 402) {
			return `Ingram Cloud refused the request: ${e.code}. Add funds to your organization.`;
		}
		if (e.status === 404) {
			return "Ingram Cloud could not find that endpoint. Check the base URL.";
		}
		return `Ingram Cloud replied ${e.status}. Try again in a moment.`;
	}
	if (e instanceof Error && /fetch|ECONNREFUSED|ENOTFOUND|network/i.test(e.message)) {
		return "Could not reach Ingram Cloud. Check your network and try again.";
	}
	return "Something went wrong talking to Ingram Cloud.";
}

/** IC refuses runs with `402 card_required` / `402 insufficient_credits`
 *  (cloud.ingram.tech docs/billing). Recognise either in a recorded failure so
 *  setup can point at the fix — funding — instead of a generic error. */
export function fundingIssue(
	message: string | null,
): "card_required" | "insufficient_credits" | null {
	if (!message) return null;
	if (/card_required/.test(message)) return "card_required";
	if (/insufficient_credits/.test(message)) return "insufficient_credits";
	return null;
}

/** Store (or replace) a user's credential: verify the token, provision the
 *  agent in its project, then persist. Throws on any failure — the row is
 *  only written once the project is known to work. */
export async function saveInferenceCredential(input: {
	userId: string;
	token: string;
	baseUrl?: string | null;
	source: CredentialSource;
}): Promise<void> {
	const conn: IcConnection = {
		apiKey: input.token,
		baseURL: input.baseUrl?.trim() || IC_DEFAULT_BASE_URL,
	};
	await verifyConnection(conn);
	const agentId = await ensureAgent(conn);
	const values = {
		tokenCiphertext: encryptSecret(input.token),
		tokenHint: hintOf(input.token),
		source: input.source,
		baseUrl: input.baseUrl?.trim() || null,
		agentId,
		agentSig: AGENT_SIG,
		updatedAt: new Date(),
		lastError: null,
		lastErrorAt: null,
	};
	await db
		.insert(inferenceCredential)
		.values({ userId: input.userId, ...values })
		.onConflictDoUpdate({ target: inferenceCredential.userId, set: values });
}

/** Forget the token. The agent in the IC project is left alone — it belongs
 *  to the user, who can revoke Sheets' access from IC's Connected apps. */
export async function removeInferenceCredential(userId: string): Promise<void> {
	await db.delete(inferenceCredential).where(eq(inferenceCredential.userId, userId));
}

export type InferenceStatus = {
	tokenHint: string;
	source: CredentialSource;
	baseUrl: string | null;
	agentId: string;
	updatedAt: Date;
	lastUsedAt: Date | null;
	lastError: string | null;
	lastErrorAt: Date | null;
};

/** What setup shows. Never the token. */
export async function inferenceStatus(userId: string): Promise<InferenceStatus | null> {
	const row = await db.query.inferenceCredential.findFirst({
		where: eq(inferenceCredential.userId, userId),
	});
	if (!row) return null;
	return {
		tokenHint: row.tokenHint,
		source: row.source,
		baseUrl: row.baseUrl,
		agentId: row.agentId,
		updatedAt: row.updatedAt,
		lastUsedAt: row.lastUsedAt,
		lastError: row.lastError,
		lastErrorAt: row.lastErrorAt,
	};
}

/** Resolve a user's inference context, reconciling the agent first if the
 *  spec changed since it was published. Null when no credential exists. */
export async function loadInference(userId: string): Promise<InferenceContext | null> {
	const row = await db.query.inferenceCredential.findFirst({
		where: eq(inferenceCredential.userId, userId),
	});
	if (!row) return null;

	const conn: IcConnection = {
		apiKey: decryptSecret(row.tokenCiphertext),
		baseURL: row.baseUrl || IC_DEFAULT_BASE_URL,
	};
	let agentId = row.agentId;
	if (row.agentSig !== AGENT_SIG) {
		try {
			agentId = await ensureAgent(conn);
		} catch (e) {
			await recordInferenceError(userId, describeIcError(e));
			throw e;
		}
		await db
			.update(inferenceCredential)
			.set({ agentId, agentSig: AGENT_SIG, updatedAt: new Date() })
			.where(eq(inferenceCredential.userId, userId));
	}
	return { userId, conn, agentId, principal: smithExternalId(userId) };
}

export async function recordInferenceUse(userId: string): Promise<void> {
	await db
		.update(inferenceCredential)
		.set({ lastUsedAt: new Date(), lastError: null, lastErrorAt: null })
		.where(eq(inferenceCredential.userId, userId));
}

/** Surface a failure in setup. `message` is shown to the user, so callers
 *  pass a description, not a raw error body. */
export async function recordInferenceError(
	userId: string,
	message: string,
): Promise<void> {
	await db
		.update(inferenceCredential)
		.set({ lastError: message.slice(0, 300), lastErrorAt: new Date() })
		.where(eq(inferenceCredential.userId, userId));
}

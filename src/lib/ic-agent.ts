/**
 * The Ingram Sheets agent, provisioned inside the USER'S OWN Ingram Cloud
 * project.
 *
 * Sheets holds no Ingram Cloud key of its own. Each user links their IC
 * organization (`src/lib/ic-oauth.ts`) or pastes a project token, and this
 * module makes sure the one agent the chat runs as exists in that project,
 * published and rolled out — create-or-adopt by `slug`, publish a new
 * immutable version only when the content differs from the active one, then
 * assert a 100% rollout (idempotent). The chat route then targets it with
 * `IC-Agent-Id` + a per-user `user`, and IC lazily provisions the smith.
 *
 * The agent's instructions are EMPTY on purpose: `/api/chat` sends the whole
 * prompt as `system`, and IC appends that to the published instructions
 * (cloud.ingram.tech#163) — anything here would double up.
 */

import { DEFAULT_BASE_URL, ICError, IngramCloud } from "@ingram-cloud/sdk/client";
import { createHash } from "node:crypto";
import { z } from "zod";

export type IcConnection = {
	apiKey: string;
	/** API origin (no `/v1`); the SDK and the ai-sdk provider both add it. */
	baseURL: string;
};

export const IC_DEFAULT_BASE_URL = DEFAULT_BASE_URL;

export const SHEETS_AGENT = {
	slug: "ingram-sheets",
	name: "Ingram Sheets",
	instructions: "",
	// The default the route runs unless SHEETS_CHAT_MODEL overrides per call.
	model: "claude-opus-4-8",
	enabled_hosted_tools: [] as string[],
	auto_memory: false,
	variables: [] as never[],
} as const;

export { ICError };

/** Stable signature of the content that warrants a new published version —
 *  the same fields IC snapshots, so a spec is compared to a published
 *  snapshot on equal terms. */
const snapshotShape = z.object({
	instructions: z.string().nullish(),
	model: z.string().nullish(),
	enabled_hosted_tools: z.array(z.string()).nullish(),
	auto_memory: z.boolean().nullish(),
	variables: z.array(z.unknown()).nullish(),
});

function contentSig(snapshot: unknown): string {
	const parsed = snapshotShape.safeParse(snapshot);
	const s = parsed.success ? parsed.data : {};
	return JSON.stringify({
		instructions: s.instructions ?? null,
		model: s.model ?? null,
		tools: [...(s.enabled_hosted_tools ?? [])].sort(),
		auto_memory: s.auto_memory ?? null,
		variables: s.variables ?? [],
	});
}

/** What a project's agent was published from. Stored per credential; when it
 *  drifts from the current build, the agent is reconciled before the next
 *  chat turn — editing the spec and deploying is the whole release. */
export const AGENT_SIG: string = createHash("sha256")
	.update(`${SHEETS_AGENT.slug}:${contentSig(SHEETS_AGENT)}`)
	.digest("hex");

export function icClient(conn: IcConnection): IngramCloud {
	return new IngramCloud({ token: conn.apiKey, baseURL: conn.baseURL });
}

/** A cheap project-scoped read that a valid project token must pass. */
export async function verifyConnection(conn: IcConnection): Promise<void> {
	await icClient(conn).agents.list({ limit: 1 });
}

/** Make the Sheets agent exist, published and live, in the project the
 *  connection names. Returns its `agt_…` id. */
export async function ensureAgent(conn: IcConnection): Promise<string> {
	const ic = icClient(conn);
	const existing = (await ic.agents.list({ limit: 200 })).data.find(
		(agent) => agent.slug === SHEETS_AGENT.slug,
	);
	const body = {
		slug: SHEETS_AGENT.slug,
		name: SHEETS_AGENT.name,
		instructions: SHEETS_AGENT.instructions,
		model: SHEETS_AGENT.model,
		enabled_hosted_tools: SHEETS_AGENT.enabled_hosted_tools,
		auto_memory: SHEETS_AGENT.auto_memory,
		variables: SHEETS_AGENT.variables,
	};

	let id: string;
	if (existing) {
		id = existing.id;
		await ic.agents.update(id, body);
	} else {
		id = (await ic.agents.create(body)).id;
	}

	const live = await ic.agents.get(id);
	const desired = contentSig(body);
	let published: string | null = null;
	if (live.active_version) {
		const active = live.active_version;
		const versions = await ic.agents.versions.list(id, { limit: 200 });
		const v = versions.data.find((x) => x.version === active);
		published = v ? contentSig(v.snapshot) : null;
	}

	let version = live.active_version ?? 0;
	if (!live.active_version || published !== desired) {
		// Only the first publish auto-activates; later ones go live via rollout.
		const pub = await ic.agents.versions.publish(id, {
			note: "published by Ingram Sheets",
		});
		version = pub.version;
	}
	await ic.agents.rollout(id, { version, percent: 100 });
	return id;
}

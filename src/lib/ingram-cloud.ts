/**
 * Ingram Cloud **management-plane** client (smiths, tenant config).
 *
 * Chat inference stays on the **data plane** — `@ingram-cloud/ai-sdk` in
 * `src/app/api/chat/route.ts`. This module is the seam for per-user BYOK: once
 * smith-level model keys ship (cloud.ingram.tech#170) we provision each user's
 * smith here and PUT their own provider key onto it, so their inference bills
 * to them instead of our tenant.
 *
 * Server-only: it holds the tenant-admin token. Never import it from a client
 * component (the provider list + client types live in `./inference-prefs`).
 */

import { IngramCloud } from "@ingram-cloud/sdk/client";
import type { ICSmith } from "@ingram-cloud/sdk/responses";

import type { InferenceProvider } from "./inference-prefs";

function client(): IngramCloud {
	const token = process.env.INGRAM_CLOUD_TOKEN;
	if (!token) throw new Error("INGRAM_CLOUD_TOKEN is not set");
	return new IngramCloud({ token });
}

/**
 * Resolve — or lazily create — the smith that backs one app user, keyed on our
 * Better Auth user id as the smith's `external_id`. Idempotent: it lists by
 * `external_id` and creates only on a miss.
 *
 * NOTE: the chat route currently provisions smiths implicitly via the ai-sdk
 * `user` field. Before this explicit path drives live inference, confirm both
 * resolve to the SAME smith (external_id alignment) against a real tenant —
 * otherwise a user ends up with two smiths.
 */
export async function resolveUserSmith(userId: string): Promise<ICSmith> {
	const ic = client();
	const page = await ic.smiths.list({ external_id: userId, limit: 1 });
	const existing = page.data.at(0);
	if (existing) return existing;
	return ic.smiths.create({
		external_id: userId,
		agent_id: process.env.IC_AGENT_ID ?? undefined,
	});
}

/** Thrown while smith-level model keys are not yet enabled on the platform. */
export class ByokPendingError extends Error {
	constructor() {
		super("Per-user provider keys are not enabled yet (cloud.ingram.tech#170)");
		this.name = "ByokPendingError";
	}
}

/**
 * Store an end user's own provider key ON THEIR SMITH, so that user's inference
 * bills to them, not our tenant.
 *
 * Flag-guarded: `smiths.modelKeys` does not exist on the platform yet
 * (cloud.ingram.tech#170). Set `IC_SMITH_MODEL_KEYS_ENABLED=true` once the
 * endpoint ships. Until then this throws {@link ByokPendingError} and the key
 * is never sent anywhere — the wizard holds it in the browser.
 */
export async function setUserProviderKey(args: {
	userId: string;
	provider: InferenceProvider;
	apiKey: string;
}): Promise<{ smithId: string }> {
	if (process.env.IC_SMITH_MODEL_KEYS_ENABLED !== "true") {
		throw new ByokPendingError();
	}
	const ic = client();
	const smith = await resolveUserSmith(args.userId);
	// The typed client gains `ic.smiths.modelKeys.put` once #170 lands; until
	// then reach the (mirrored-from-tenant) endpoint via the raw request seam.
	await ic.request(
		"PUT",
		`/smiths/${encodeURIComponent(smith.id)}/model_keys/${args.provider}`,
		{ smith: smith.id, body: { api_key: args.apiKey } },
	);
	return { smithId: smith.id };
}

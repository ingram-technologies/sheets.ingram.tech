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

import { INFERENCE_PROVIDERS, type InferenceProvider } from "./inference-prefs";

function client(): IngramCloud {
	const token = process.env.INGRAM_CLOUD_TOKEN;
	if (!token) throw new Error("INGRAM_CLOUD_TOKEN is not set");
	return new IngramCloud({ token });
}

/**
 * The identity string that names one user's smith.
 *
 * It MUST be byte-identical everywhere the smith is addressed: the ai-sdk
 * `user` field the chat route sends (data-plane lazy provisioning) and the
 * `external_id` we upsert here (management plane). Both go through IC's single
 * `provisionSmith`, keyed on `(external_id, agent)` behind a unique constraint,
 * so an aligned string guarantees the two paths converge on ONE smith — a key
 * set before the first chat lands on exactly the smith that chat runs as
 * (cloud.ingram.tech#170).
 *
 * Assumes IC stores the OpenAI-compat `user` value verbatim as external_id;
 * verify that mapping against a live tenant before flipping the flag on.
 */
export function smithExternalId(userId: string): string {
	return `user:${userId}`;
}

/**
 * Ensure the user's smith exists and return it (with its `smt_` id). Idempotent
 * upsert on `(external_id, agent)` — `POST /v1/smiths` is 200-if-exists /
 * 201-if-created, needs no run and no published agent (cloud.ingram.tech#170).
 */
export async function resolveUserSmith(userId: string): Promise<ICSmith> {
	const ic = client();
	return ic.smiths.create({
		external_id: smithExternalId(userId),
		agent_id: process.env.IC_AGENT_ID ?? undefined,
	});
}

/**
 * Store an end user's own provider key ON THEIR SMITH (cloud.ingram.tech#170),
 * so that user's inference bills to their provider account, not our tenant. IC
 * resolves smith → tenant → hosted at run time, so once this is set the user's
 * chats (which already run as this smith) bill to them with no further wiring.
 *
 * The key is handed straight to Ingram Cloud and never persisted by us. A key
 * that is present but rejected surfaces as the provider's auth error on the
 * user's next run — IC deliberately does NOT fall back to the tenant key.
 *
 * `workspaceId` is Anthropic's `anthropic-workspace-id`: an identity-linked
 * ("Same as linked account") Claude key spans every workspace the person can
 * reach, so Anthropic rejects its requests until one is named. IC sends it as
 * the header on that smith's runs (cloud.ingram.tech#267). Workspace-scoped
 * keys don't need it, and other providers ignore it.
 */
export async function setUserProviderKey(args: {
	userId: string;
	provider: InferenceProvider;
	apiKey: string;
	workspaceId?: string;
}): Promise<{ smithId: string }> {
	const ic = client();
	const smith = await resolveUserSmith(args.userId);
	await ic.smiths.modelKeys.put(smith.id, args.provider, {
		api_key: args.apiKey,
		workspace_id: args.workspaceId ?? null,
	});
	return { smithId: smith.id };
}

/** Which providers this user has a smith-level key for (presence only — keys
 *  are never read back). */
export async function listUserProviderKeys(
	userId: string,
): Promise<InferenceProvider[]> {
	const ic = client();
	const smith = await resolveUserSmith(userId);
	const keys = await ic.smiths.modelKeys.list(smith.id);
	return keys
		.map((key) => key.provider)
		.filter((provider): provider is InferenceProvider =>
			(INFERENCE_PROVIDERS as readonly string[]).includes(provider),
		);
}

/** Remove a user's own key for one provider — their runs fall back to the
 *  tenant/hosted key again. */
export async function clearUserProviderKey(
	userId: string,
	provider: InferenceProvider,
): Promise<void> {
	const ic = client();
	const smith = await resolveUserSmith(userId);
	await ic.smiths.modelKeys.delete(smith.id, provider);
}

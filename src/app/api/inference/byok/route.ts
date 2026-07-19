import { z } from "zod";

import { ByokPendingError, setUserProviderKey } from "@/lib/ingram-cloud";
import { INFERENCE_PROVIDERS } from "@/lib/inference-prefs";
import { requireApiUser } from "@/lib/session";

// The user's own provider key, forwarded to Ingram Cloud to bill their smith's
// inference to them. We do NOT persist it: it is either handed straight to IC
// (once cloud.ingram.tech#170 ships) or rejected as pending — never stored here.
const bodySchema = z.object({
	provider: z.enum(INFERENCE_PROVIDERS),
	apiKey: z.string().min(20).max(400),
});

export async function POST(request: Request) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;

	const parsed = bodySchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}

	try {
		const { smithId } = await setUserProviderKey({
			userId: gate.userId,
			provider: parsed.data.provider,
			apiKey: parsed.data.apiKey,
		});
		return Response.json({ status: "activated", smithId });
	} catch (error) {
		// Expected until #170: the platform can't take a per-user key yet. Tell
		// the client to keep the choice locally and retry once it's enabled.
		if (error instanceof ByokPendingError) {
			return Response.json(
				{ status: "pending", issue: "cloud.ingram.tech#170" },
				{ status: 202 },
			);
		}
		const message = error instanceof Error ? error.message : "failed to save key";
		return Response.json({ error: message }, { status: 502 });
	}
}

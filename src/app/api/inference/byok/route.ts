import { z } from "zod";

import {
	clearUserProviderKey,
	listUserProviderKeys,
	setUserProviderKey,
} from "@/lib/ingram-cloud";
import { INFERENCE_PROVIDERS } from "@/lib/inference-prefs";
import { requireApiUser } from "@/lib/session";

// The user's own provider key, forwarded to Ingram Cloud to bill their smith's
// inference to them (cloud.ingram.tech#170). We never persist it: it goes
// straight to IC's model-keys endpoint and is dropped.
const putSchema = z.object({
	provider: z.enum(INFERENCE_PROVIDERS),
	apiKey: z.string().min(20).max(400),
});

const deleteSchema = z.object({ provider: z.enum(INFERENCE_PROVIDERS) });

export async function POST(request: Request) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;

	const parsed = putSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}

	try {
		const { smithId } = await setUserProviderKey({
			userId: gate.userId,
			provider: parsed.data.provider,
			apiKey: parsed.data.apiKey,
		});
		return Response.json({
			status: "active",
			provider: parsed.data.provider,
			smithId,
		});
	} catch (error) {
		return Response.json({ error: message(error) }, { status: 502 });
	}
}

export async function GET() {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	try {
		const providers = await listUserProviderKeys(gate.userId);
		return Response.json({ providers });
	} catch (error) {
		return Response.json({ error: message(error) }, { status: 502 });
	}
}

export async function DELETE(request: Request) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;

	const parsed = deleteSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json({ error: "invalid body" }, { status: 400 });
	}
	try {
		await clearUserProviderKey(gate.userId, parsed.data.provider);
		return Response.json({ status: "cleared" });
	} catch (error) {
		return Response.json({ error: message(error) }, { status: 502 });
	}
}

function message(error: unknown): string {
	return error instanceof Error ? error.message : "inference key request failed";
}

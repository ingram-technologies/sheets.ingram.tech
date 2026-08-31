import { z } from "zod";

import {
	describeIcError,
	removeInferenceCredential,
	saveInferenceCredential,
} from "@/lib/inference";
import { inferenceView } from "@/lib/inference-view";
import { requireApiUser } from "@/lib/session";
import { credentialsKeyConfigured } from "@/lib/secrets";

/**
 * The signed-in user's Ingram Cloud credential — how their agent is powered.
 *
 * GET answers the client-safe `InferenceView` (never the token). POST is the
 * paste fallback to the one-click link (`/internal/connect/ingram-cloud/
 * start`): a project token, verified against IC and the agent provisioned
 * before anything is written. DELETE forgets it.
 */

const postSchema = z.object({
	token: z.string().trim().min(16).max(4096),
	// Self-hosted IC only; must be an https origin.
	baseUrl: z
		.string()
		.trim()
		.max(512)
		.optional()
		.transform((v) => (v ? v : undefined))
		.pipe(z.url().startsWith("https://").optional()),
	// Where the caller is, so a funding link can bring them back there.
	returnPath: z.string().max(512).optional(),
});

export async function GET(request: Request) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const returnPath = new URL(request.url).searchParams.get("return") ?? undefined;
	return Response.json(await inferenceView(gate.userId, returnPath));
}

export async function POST(request: Request) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const parsed = postSchema.safeParse(await request.json());
	if (!parsed.success) {
		return Response.json(
			{
				error: "Paste a project token (tha_live_…); the base URL, if set, must be https.",
			},
			{ status: 400 },
		);
	}
	if (!credentialsKeyConfigured()) {
		return Response.json(
			{
				error: "This deployment cannot store credentials yet (SHEETS_CREDENTIALS_KEY is unset).",
			},
			{ status: 503 },
		);
	}
	try {
		await saveInferenceCredential({
			userId: gate.userId,
			token: parsed.data.token,
			baseUrl: parsed.data.baseUrl ?? null,
			source: "paste",
		});
	} catch (e) {
		return Response.json({ error: describeIcError(e) }, { status: 502 });
	}
	return Response.json(await inferenceView(gate.userId, parsed.data.returnPath));
}

export async function DELETE(request: Request) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	await removeInferenceCredential(gate.userId);
	const returnPath = new URL(request.url).searchParams.get("return") ?? undefined;
	return Response.json(await inferenceView(gate.userId, returnPath));
}

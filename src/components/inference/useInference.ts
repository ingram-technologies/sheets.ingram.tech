"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import type { InferenceView } from "@/lib/inference-client";

// Our own API, but a fetch is still an external boundary: parse, don't cast.
const viewSchema = z.object({
	linkAvailable: z.boolean(),
	storageReady: z.boolean(),
	credential: z
		.object({
			tokenHint: z.string(),
			source: z.enum(["oauth", "paste"]),
			funding: z
				.object({
					issue: z.enum(["card_required", "insufficient_credits"]),
					url: z.string().nullable(),
				})
				.nullable(),
			updatedAt: z.string(),
			lastUsedAt: z.string().nullable(),
			lastError: z.string().nullable(),
		})
		.nullable(),
});

export function parseInferenceView(body: unknown): InferenceView | null {
	const parsed = viewSchema.safeParse(body);
	return parsed.success ? parsed.data : null;
}

/** The page the user is on, so a funding link can bring them back here. */
export function currentPath(): string {
	return typeof window === "undefined" ? "/spreadsheets" : window.location.pathname;
}

async function fetchInferenceView(): Promise<InferenceView | null> {
	try {
		const res = await fetch(
			`/api/inference?return=${encodeURIComponent(currentPath())}`,
		);
		if (!res.ok) return null;
		return parseInferenceView(await res.json());
	} catch {
		return null;
	}
}

/**
 * How the signed-in user's agent is powered, as the server sees it. `null`
 * until the first answer arrives (or with a server-rendered `initial`, never).
 */
export function useInference(initial?: InferenceView) {
	const [view, setView] = useState<InferenceView | null>(initial ?? null);
	const refresh = useCallback(
		() =>
			fetchInferenceView().then((next) => {
				// Offline or unauthorized: keep whatever we last knew.
				if (next) setView(next);
			}),
		[],
	);
	useEffect(() => {
		if (!initial) void refresh();
	}, [initial, refresh]);
	return { view, setView, refresh };
}

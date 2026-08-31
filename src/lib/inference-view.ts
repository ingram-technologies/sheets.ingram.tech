/**
 * Build the client-safe `InferenceView` for one user: the credential status
 * plus what this deployment can offer (link / store). Server-only glue between
 * `inference.ts`, `ic-oauth.ts` and `secrets.ts`.
 */

import "server-only";

import { billingUrl, icOauthConfig } from "@/lib/ic-oauth";
import { fundingIssue, inferenceStatus } from "@/lib/inference";
import type { InferenceView } from "@/lib/inference-client";
import { credentialsKeyConfigured } from "@/lib/secrets";

export async function inferenceView(
	userId: string,
	returnPath?: string,
): Promise<InferenceView> {
	const status = await inferenceStatus(userId);
	const oauth = icOauthConfig();
	const storageReady = credentialsKeyConfigured();
	const issue = fundingIssue(status?.lastError ?? null);
	return {
		linkAvailable: oauth !== null && storageReady,
		storageReady,
		credential: status
			? {
					tokenHint: status.tokenHint,
					source: status.source,
					funding: issue
						? {
								issue,
								url:
									oauth && status.source === "oauth"
										? billingUrl(oauth, returnPath)
										: null,
							}
						: null,
					updatedAt: status.updatedAt.toISOString(),
					lastUsedAt: status.lastUsedAt?.toISOString() ?? null,
					lastError: status.lastError,
				}
			: null,
	};
}

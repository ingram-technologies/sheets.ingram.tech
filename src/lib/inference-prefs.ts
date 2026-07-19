/**
 * Client-side inference preferences.
 *
 * Ingram Sheets' agent runs on Claude via Ingram Cloud. The setup wizard sends
 * a bring-your-own-key user's key to `/api/inference/byok`, which PUTs it onto
 * their smith (cloud.ingram.tech#170) so their inference bills to them. The raw
 * key is NEVER stored here — only the user's choice and a masked hint, so this
 * browser can show what's configured without holding a secret.
 *
 * Kept free of any `@ingram-cloud/sdk` import so it stays client-safe (the SDK
 * carries the tenant token seam and must never reach the browser bundle).
 */

export const INFERENCE_PROVIDERS = ["anthropic", "openai", "google"] as const;

export type InferenceProvider = (typeof INFERENCE_PROVIDERS)[number];

export const PROVIDER_LABELS: Record<InferenceProvider, string> = {
	anthropic: "Anthropic (Claude)",
	openai: "OpenAI",
	google: "Google (Gemini)",
};

/** Rough shape of a provider key, for a soft "this doesn't look right" hint —
 *  never a hard gate, since key formats drift. */
const PROVIDER_KEY_PREFIX: Record<InferenceProvider, string> = {
	anthropic: "sk-ant-",
	openai: "sk-",
	google: "AIza",
};

export function keyLooksValid(provider: InferenceProvider, key: string): boolean {
	const trimmed = key.trim();
	if (trimmed.length < 20) return false;
	return trimmed.startsWith(PROVIDER_KEY_PREFIX[provider]);
}

/** Last 4 chars, for a non-secret confirmation the user can recognise. */
export function maskKey(key: string): string {
	const trimmed = key.trim();
	return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}

// Choosing how the agent is powered is NOT optional — the setup gate blocks the
// app until one is set. `paid` (a funded balance through Ingram Cloud) is the
// phase-2 option; today only `byok` can actually be selected.
export type InferenceMode = "byok" | "paid";

export interface InferencePrefs {
	mode: InferenceMode;
	provider?: InferenceProvider;
	/** Masked last-4 hint for `byok` (e.g. `••••a1b2`) — never the raw key. */
	keyHint?: string;
	configuredAt: string;
}

const STORAGE_KEY = "ingram-sheets.inference.v1";

function isProvider(value: unknown): value is InferenceProvider {
	return (
		typeof value === "string" &&
		(INFERENCE_PROVIDERS as readonly string[]).includes(value)
	);
}

/** Parse without trusting the stored blob's shape — a hand-edited or stale
 *  localStorage value must not throw at read time. */
export function loadInferencePrefs(): InferencePrefs | null {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return null;
		const record: Record<string, unknown> = { ...parsed };
		const mode = record.mode;
		if (mode !== "byok" && mode !== "paid") return null;
		return {
			mode,
			provider: isProvider(record.provider) ? record.provider : undefined,
			keyHint: typeof record.keyHint === "string" ? record.keyHint : undefined,
			configuredAt:
				typeof record.configuredAt === "string"
					? record.configuredAt
					: new Date().toISOString(),
		};
	} catch {
		return null;
	}
}

export function saveInferencePrefs(prefs: InferencePrefs): void {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function clearInferencePrefs(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(STORAGE_KEY);
}

export function isInferenceConfigured(): boolean {
	return loadInferencePrefs() !== null;
}

"use client";

import {
	ArrowLeftIcon,
	CheckIcon,
	CreditCardIcon,
	KeyRoundIcon,
	Loader2Icon,
	ShieldCheckIcon,
	SparklesIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import {
	INFERENCE_PROVIDERS,
	type InferenceProvider,
	keyLooksValid,
	loadInferencePrefs,
	PROVIDER_LABELS,
	saveInferencePrefs,
} from "@/lib/inference-prefs";
import { cn } from "@/lib/utils";

type Step = "choose" | "key";

/**
 * First-run setup: how the user powers the agent. Bring-your-own-key today; a
 * pay-as-you-go balance through Ingram Cloud is the phase-2 option (waiting on
 * per-smith billing, cloud.ingram.tech#170). Self-gates on localStorage — it
 * shows once, until a choice is made.
 */
export function SetupWizard() {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<Step>("choose");
	const [provider, setProvider] = useState<InferenceProvider>("anthropic");
	const [apiKey, setApiKey] = useState("");
	const [saving, setSaving] = useState(false);

	// Gate on the client only — the prefs live in localStorage, so rendering is
	// deferred to an effect to avoid a hydration mismatch on first paint.
	useEffect(() => {
		if (loadInferencePrefs() === null) setOpen(true);
	}, []);

	const chooseHosted = () => {
		saveInferencePrefs({ mode: "hosted", configuredAt: new Date().toISOString() });
		setOpen(false);
	};

	const saveKey = async () => {
		const trimmed = apiKey.trim();
		if (!trimmed) return;
		if (!keyLooksValid(provider, trimmed)) {
			toast.error(
				`That doesn't look like a ${PROVIDER_LABELS[provider]} key. Double-check and try again.`,
			);
			return;
		}
		setSaving(true);
		// Held in this browser only until per-user keys go live; see inference-prefs.
		saveInferencePrefs({
			mode: "byok",
			provider,
			apiKey: trimmed,
			configuredAt: new Date().toISOString(),
		});
		try {
			const response = await fetch("/api/inference/byok", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider, apiKey: trimmed }),
			});
			if (response.status === 202) {
				toast.success(
					"Key saved. It activates automatically once per-user billing goes live.",
				);
			} else if (response.ok) {
				toast.success("Your key is active — inference now bills to you.");
			} else {
				// Still saved locally; surface the server's reason but don't block.
				toast.error(
					"Saved locally, but Ingram Cloud rejected the key for now.",
				);
			}
		} catch {
			toast.error("Saved locally — couldn't reach the server to activate it.");
		} finally {
			setSaving(false);
			setOpen(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<div className="mb-1 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
						<SparklesIcon className="size-4.5" />
					</div>
					<DialogTitle>
						{step === "choose" ? "Power your agent" : "Add your API key"}
					</DialogTitle>
					<DialogDescription>
						{step === "choose"
							? "Ingram Sheets' agent runs on Claude. Choose how you'd like to pay for its inference."
							: "Your key stays in this browser and is used only to run your agent."}
					</DialogDescription>
				</DialogHeader>

				{step === "choose" ? (
					<div className="space-y-2.5">
						<OptionCard
							icon={KeyRoundIcon}
							title="Bring your own key"
							description="Use your own provider API key. Inference is billed to you, directly by the provider."
							onClick={() => setStep("key")}
						/>
						<OptionCard
							icon={CreditCardIcon}
							title="Pay as you go"
							description="Top up a balance and we handle the provider — billed through Ingram Cloud."
							badge="Coming soon"
							disabled
						/>
						<button
							type="button"
							onClick={chooseHosted}
							className="w-full pt-1 text-center text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						>
							Not now — use the shared demo allowance
						</button>
					</div>
				) : (
					<form
						onSubmit={(event) => {
							event.preventDefault();
							void saveKey();
						}}
						className="space-y-3"
					>
						<div className="space-y-1.5">
							<label
								htmlFor="byok-provider"
								className="text-xs font-medium text-muted-foreground"
							>
								Provider
							</label>
							<select
								id="byok-provider"
								value={provider}
								onChange={(event) => {
									const next = INFERENCE_PROVIDERS.find(
										(p) => p === event.target.value,
									);
									if (next) setProvider(next);
								}}
								className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
							>
								{INFERENCE_PROVIDERS.map((p) => (
									<option key={p} value={p}>
										{PROVIDER_LABELS[p]}
									</option>
								))}
							</select>
						</div>

						<div className="space-y-1.5">
							<label
								htmlFor="byok-key"
								className="text-xs font-medium text-muted-foreground"
							>
								API key
							</label>
							<Input
								id="byok-key"
								autoFocus
								type="password"
								autoComplete="off"
								value={apiKey}
								onChange={(event) => setApiKey(event.target.value)}
								placeholder={
									provider === "anthropic" ? "sk-ant-…" : "sk-…"
								}
								className="font-mono"
							/>
						</div>

						<p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
							<ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
							<span>
								Stored in this browser only. Per-user billing is rolling
								out — your key activates automatically the moment
								it&apos;s live.
							</span>
						</p>

						<div className="flex items-center justify-between pt-1">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={() => setStep("choose")}
							>
								<ArrowLeftIcon className="size-4" />
								Back
							</Button>
							<Button
								type="submit"
								size="sm"
								disabled={!apiKey.trim() || saving}
							>
								{saving ? (
									<Loader2Icon className="size-4 animate-spin" />
								) : (
									<CheckIcon className="size-4" />
								)}
								Save key
							</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

function OptionCard({
	icon: Icon,
	title,
	description,
	onClick,
	badge,
	disabled,
}: {
	icon: typeof KeyRoundIcon;
	title: string;
	description: string;
	onClick?: () => void;
	badge?: string;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors",
				disabled
					? "cursor-not-allowed opacity-60"
					: "hover:border-primary/40 hover:bg-accent",
			)}
		>
			<span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
				<Icon className="size-4" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-2">
					<span className="text-sm font-medium">{title}</span>
					{badge ? (
						<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
							{badge}
						</span>
					) : null}
				</span>
				<span className="mt-0.5 block text-xs text-muted-foreground">
					{description}
				</span>
			</span>
		</button>
	);
}

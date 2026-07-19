"use client";

import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CheckIcon,
	CreditCardIcon,
	KeyRoundIcon,
	Loader2Icon,
	ShieldCheckIcon,
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
	maskKey,
	PROVIDER_LABELS,
	saveInferencePrefs,
} from "@/lib/inference-prefs";
import { cn } from "@/lib/utils";

type Step = "choose" | "key";

/**
 * First-run setup: who pays for the agent's inference. Bring-your-own-key
 * attaches the user's provider key to their smith (cloud.ingram.tech#170), so
 * their chats bill to their own account; pay-as-you-go (a funded balance
 * through Ingram Cloud) is the phase-2 option. Self-gates on localStorage — it
 * shows once, until a choice is made — and never holds the raw key.
 */
export function SetupWizard() {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<Step>("choose");
	const [provider, setProvider] = useState<InferenceProvider>("anthropic");
	const [apiKey, setApiKey] = useState("");
	const [saving, setSaving] = useState(false);

	// Gate on the client only — prefs live in localStorage, so the decision is
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
		if (!trimmed || saving) return;
		if (!keyLooksValid(provider, trimmed)) {
			toast.error(
				`That doesn't look like a ${PROVIDER_LABELS[provider]} key — check it and try again.`,
			);
			return;
		}
		setSaving(true);
		try {
			const response = await fetch("/api/inference/byok", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ provider, apiKey: trimmed }),
			});
			if (!response.ok) {
				toast.error(
					"Ingram Cloud couldn't accept that key — check it and retry.",
				);
				return;
			}
			// Record the choice + a masked hint only; the key itself is now on the
			// smith and never touches this browser's storage.
			saveInferencePrefs({
				mode: "byok",
				provider,
				keyHint: maskKey(trimmed),
				configuredAt: new Date().toISOString(),
			});
			setApiKey("");
			toast.success("Key attached — your agent now bills to your own account.");
			setOpen(false);
		} catch {
			toast.error("Couldn't reach the server — check your connection and retry.");
		} finally {
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogContent className="max-w-md gap-5">
				{step === "choose" ? (
					<div
						key="choose"
						className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
					>
						<DialogHeader>
							<DialogTitle>Power the agent</DialogTitle>
							<DialogDescription>
								The agent runs on Claude. Choose who pays for its
								inference — you can change this later.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-2">
							<OptionRow
								icon={KeyRoundIcon}
								title="Use your own API key"
								description="Bill inference to your own provider account. Nothing runs through us."
								onClick={() => setStep("key")}
							/>
							<OptionRow
								icon={CreditCardIcon}
								title="Pay as you go"
								description="Top up a balance and we handle the provider, billed through Ingram Cloud."
								tag="Soon"
								disabled
							/>
						</div>

						<button
							type="button"
							onClick={chooseHosted}
							className="w-full rounded-md py-1 text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						>
							Not now — use the shared allowance
						</button>
					</div>
				) : (
					<form
						key="key"
						onSubmit={(event) => {
							event.preventDefault();
							void saveKey();
						}}
						className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-200"
					>
						<DialogHeader>
							<DialogTitle>Add your API key</DialogTitle>
							<DialogDescription>
								Attached to your agent right away. We never store it.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-3">
							<label className="block space-y-1.5">
								<span className="text-xs font-medium text-muted-foreground">
									Provider
								</span>
								<select
									value={provider}
									onChange={(event) => {
										const next = INFERENCE_PROVIDERS.find(
											(candidate) =>
												candidate === event.target.value,
										);
										if (next) setProvider(next);
									}}
									className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
								>
									{INFERENCE_PROVIDERS.map((candidate) => (
										<option key={candidate} value={candidate}>
											{PROVIDER_LABELS[candidate]}
										</option>
									))}
								</select>
							</label>

							<label className="block space-y-1.5">
								<span className="text-xs font-medium text-muted-foreground">
									API key
								</span>
								<Input
									autoFocus
									type="password"
									autoComplete="off"
									spellCheck={false}
									value={apiKey}
									onChange={(event) => setApiKey(event.target.value)}
									placeholder={
										provider === "anthropic" ? "sk-ant-…" : "sk-…"
									}
									className="font-mono"
								/>
							</label>
						</div>

						<p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
							<ShieldCheckIcon className="mt-px size-3.5 shrink-0" />
							<span>
								Sent once to Ingram Cloud and attached to your agent —
								it never rests in this browser. A wrong key shows up as
								an error on your next message.
							</span>
						</p>

						<div className="flex items-center justify-between">
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
								{saving ? "Attaching…" : "Save key"}
							</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

function OptionRow({
	icon: Icon,
	title,
	description,
	onClick,
	tag,
	disabled,
}: {
	icon: typeof KeyRoundIcon;
	title: string;
	description: string;
	onClick?: () => void;
	tag?: string;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={cn(
				"group flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
				disabled
					? "cursor-not-allowed opacity-55"
					: "hover:border-primary/50 hover:bg-accent",
			)}
		>
			<span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 text-muted-foreground transition-colors group-enabled:group-hover:text-foreground">
				<Icon className="size-4" />
			</span>
			<span className="min-w-0 flex-1">
				<span className="flex items-center gap-2">
					<span className="text-sm font-medium text-foreground">{title}</span>
					{tag ? (
						<span className="rounded-full border border-border px-1.5 py-px text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
							{tag}
						</span>
					) : null}
				</span>
				<span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
					{description}
				</span>
			</span>
			{disabled ? null : (
				<ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
			)}
		</button>
	);
}

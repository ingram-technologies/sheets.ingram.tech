"use client";

import {
	ArrowLeftIcon,
	ArrowRightIcon,
	CheckIcon,
	CloudIcon,
	ExternalLinkIcon,
	KeyRoundIcon,
	Loader2Icon,
	MonitorIcon,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

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
import { deferInference, type InferenceView } from "@/lib/inference-client";
import { cn } from "@/lib/utils";
import { agentMode, setAgentMode, webMcpSupported } from "@/lib/webmcp";

import { currentPath, parseInferenceView } from "./useInference";

type Step = "choose" | "paste";

const CONSOLE_BILLING = "https://cloud.ingram.tech/console/settings/billing";

/**
 * Setup + settings for how the agent is powered.
 *
 * Two answers. Ingram Cloud: "Link Ingram Cloud" is one click — IC signs them
 * in or up, they pick an organization, and IC hands us a project token for a
 * project it creates there (`src/lib/ic-oauth.ts`); pasting a project token is
 * the fallback. Inference then runs, and bills, on that project; we never hold
 * a provider key. Or the browser's own agent over WebMCP, where the model is
 * ChatGPT's or Chrome's, the workbook's tools are published to it, and there
 * is nothing to link — offered only where the browser has the API.
 *
 * Fully controlled — the host decides when to open it: as a first-run nudge,
 * as settings (from the menu), or when the user tries to message the agent
 * without having linked. It's always dismissible; dismissing while nothing is
 * linked records "look around first" so the nudge doesn't nag, but the
 * message-time gate still re-appears.
 */
export function SetupWizard({
	open,
	onOpenChange,
	view,
	onViewChange,
	refresh,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Server truth, `null` while loading. */
	view: InferenceView | null;
	onViewChange: (next: InferenceView) => void;
	refresh: () => Promise<void>;
}) {
	const [step, setStep] = useState<Step>("choose");
	const [token, setToken] = useState("");
	const [saving, setSaving] = useState(false);
	const [linking, setLinking] = useState(false);
	// Whether this browser has the WebMCP API, and which way the user chose.
	// Both live only in the browser, so they read as external stores rather
	// than effects — the dialog can be open on the very first paint.
	const [modeChoice, setModeChoice] = useState<string | null>(null);
	const webMcp = useSyncExternalStore(subscribeNever, webMcpSupported, () => false);
	const storedMode = useSyncExternalStore(subscribeNever, agentMode, () => null);
	const mode = modeChoice ?? storedMode;

	// Each time it opens, reset to the top. Adjusted during render off a
	// previous-prop sentinel rather than in an effect: an effect would paint
	// one frame of the last visit's step before correcting it.
	const [wasOpen, setWasOpen] = useState(false);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setStep("choose");
			setToken("");
		}
	}

	// Coming back from Ingram Cloud: the callback lands on the page the link
	// started from with `?ic=linked|denied|error`. Turn it into a toast, strip
	// it from the URL so a reload doesn't repeat it, and re-open on failure.
	useEffect(() => {
		const url = new URL(window.location.href);
		const status = url.searchParams.get("ic");
		if (!status) return;
		const detail = url.searchParams.get("detail");
		url.searchParams.delete("ic");
		url.searchParams.delete("detail");
		window.history.replaceState(window.history.state, "", url.toString());
		if (status === "linked") {
			toast.success("Ingram Cloud linked — your agent is ready.");
			void refresh();
		} else if (status === "denied") {
			toast("Linking cancelled. You can link Ingram Cloud any time.");
			onOpenChange(true);
		} else {
			toast.error(detail || "Linking Ingram Cloud failed. Try again.");
			void refresh();
			onOpenChange(true);
		}
		// Effectively once: the query is stripped on the first pass, so a re-run
		// (a new callback identity) finds nothing and returns early.
	}, [refresh, onOpenChange]);

	const credential = view?.credential ?? null;

	// Dismissing without a linked account means "look around first" — remember
	// it so the automatic nudge stays quiet (the send-time gate still fires).
	const dismiss = () => {
		if (!credential) deferInference();
		onOpenChange(false);
	};

	const chooseBrowserAgent = () => {
		setAgentMode("webmcp");
		setModeChoice("webmcp");
		toast.success("Your browser's agent can now drive this workbook.");
		onOpenChange(false);
	};

	const link = () => {
		setLinking(true);
		window.location.assign(
			`/internal/connect/ingram-cloud/start?return=${encodeURIComponent(currentPath())}`,
		);
	};

	const saveToken = async () => {
		const trimmed = token.trim();
		if (!trimmed || saving) return;
		setSaving(true);
		try {
			const response = await fetch("/api/inference", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ token: trimmed, returnPath: currentPath() }),
			});
			const body: unknown = await response.json();
			if (!response.ok) {
				toast.error(
					errorOf(body) ?? "Ingram Cloud couldn't accept that token.",
				);
				return;
			}
			const next = parseInferenceView(body);
			if (next) onViewChange(next);
			setToken("");
			toast.success("Token saved — your agent is ready.");
			onOpenChange(false);
		} catch {
			toast.error("Couldn't reach the server — check your connection and retry.");
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		try {
			const response = await fetch(
				`/api/inference?return=${encodeURIComponent(currentPath())}`,
				{ method: "DELETE" },
			);
			const next = parseInferenceView(await response.json());
			if (next) onViewChange(next);
			toast.success(
				"Ingram Cloud unlinked. Link again whenever you want the agent.",
			);
		} catch {
			toast.error("Couldn't reach the server — check your connection and retry.");
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) dismiss();
			}}
		>
			<DialogContent className="max-w-md gap-5">
				{step === "choose" ? (
					<div
						key="choose"
						className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
					>
						<DialogHeader>
							<DialogTitle>Power the agent</DialogTitle>
							<DialogDescription>
								Either run it on Ingram Cloud in your own organization,
								where inference bills to you and we never hold a key —
								or let the agent already in your browser drive the
								sheet.
							</DialogDescription>
						</DialogHeader>

						{credential ? (
							<div className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs">
								<div className="flex items-center justify-between gap-3">
									<span className="flex min-w-0 items-center gap-2 text-muted-foreground">
										<CloudIcon className="size-3.5 shrink-0 text-primary" />
										<span className="truncate">
											{credential.source === "oauth"
												? "Linked to Ingram Cloud"
												: "Project token"}
											<span className="ml-1.5 font-mono text-foreground">
												{credential.tokenHint}
											</span>
										</span>
									</span>
									<button
										type="button"
										onClick={() => void remove()}
										className="shrink-0 rounded text-destructive-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
									>
										Remove
									</button>
								</div>
								{credential.funding ? (
									<p className="text-foreground">
										Ingram Cloud needs funds before it will run the
										agent.{" "}
										<a
											href={
												credential.funding.url ??
												CONSOLE_BILLING
											}
											className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
										>
											Add funds
											<ExternalLinkIcon className="size-3" />
										</a>
									</p>
								) : credential.lastError ? (
									<p className="text-destructive-ink">
										{credential.lastError}
									</p>
								) : null}
							</div>
						) : null}

						{mode === "webmcp" ? (
							<div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
								<MonitorIcon className="size-3.5 shrink-0 text-primary" />
								<span>
									Your browser&rsquo;s agent drives this workbook.
									Open a sheet and look for its site tools.
								</span>
							</div>
						) : null}

						<div className="space-y-2">
							<OptionRow
								icon={MonitorIcon}
								title="Use your browser's agent"
								description="ChatGPT or Chrome operates the sheet directly over WebMCP. Nothing to link, and the turns run on their side."
								onClick={webMcp ? chooseBrowserAgent : undefined}
								disabled={!webMcp}
								tag={webMcp ? undefined : "Unsupported here"}
							/>
							{view?.linkAvailable ? (
								<OptionRow
									icon={linking ? Loader2Icon : CloudIcon}
									iconClassName={linking ? "animate-spin" : undefined}
									title={
										credential
											? "Link a different organization"
											: "Link Ingram Cloud"
									}
									description="One click: sign in or create an account, pick an organization, done."
									onClick={link}
									disabled={linking}
								/>
							) : null}
							<OptionRow
								icon={KeyRoundIcon}
								title={
									credential
										? "Replace the project token"
										: "Paste a project token"
								}
								description="From the Ingram Cloud console — a tha_live_… token for the project the agent should run in."
								onClick={() => setStep("paste")}
								disabled={view !== null && !view.storageReady}
								tag={
									view !== null && !view.storageReady
										? "Unavailable"
										: undefined
								}
							/>
						</div>

						{credential === null ? (
							<button
								type="button"
								onClick={dismiss}
								className="w-full rounded-md py-1 text-center text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
							>
								Let me look around first
							</button>
						) : null}
					</div>
				) : (
					<form
						key="paste"
						onSubmit={(event) => {
							event.preventDefault();
							void saveToken();
						}}
						className="space-y-5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-200"
					>
						<DialogHeader>
							<DialogTitle>Paste a project token</DialogTitle>
							<DialogDescription>
								Verified with Ingram Cloud and stored encrypted. The
								agent is set up in that project right away.
							</DialogDescription>
						</DialogHeader>

						<label className="block space-y-1.5">
							<span className="text-xs font-medium text-muted-foreground">
								Project token
							</span>
							<Input
								autoFocus
								type="password"
								autoComplete="off"
								spellCheck={false}
								value={token}
								onChange={(event) => setToken(event.target.value)}
								placeholder="tha_live_…"
								className="font-mono"
							/>
						</label>

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
								disabled={!token.trim() || saving}
							>
								{saving ? (
									<Loader2Icon className="size-4 animate-spin" />
								) : (
									<CheckIcon className="size-4" />
								)}
								{saving ? "Verifying…" : "Save token"}
							</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}

/** Neither fact changes without a reload, so there is nothing to subscribe to. */
function subscribeNever(): () => void {
	return () => {};
}

function errorOf(body: unknown): string | null {
	return typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof body.error === "string"
		? body.error
		: null;
}

function OptionRow({
	icon: Icon,
	iconClassName,
	title,
	description,
	onClick,
	tag,
	disabled,
}: {
	icon: typeof KeyRoundIcon;
	iconClassName?: string;
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
				<Icon className={cn("size-4", iconClassName)} />
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

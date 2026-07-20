"use client";

import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import {
	ArrowUpIcon,
	CircleAlertIcon,
	Loader2Icon,
	PencilLineIcon,
	SparklesIcon,
	SquareIcon,
} from "lucide-react";
import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { Streamdown } from "streamdown";

import { SetupWizard } from "@/components/inference/SetupWizard";
import { Button } from "@/components/ui/button";
import type { AgentToolName } from "@/lib/agent-tools";
import { agentToolSchemas } from "@/lib/agent-tools";
import { isInferenceConfigured } from "@/lib/inference-prefs";
import { cn } from "@/lib/utils";

import { AgentExecutor } from "../workbook/agent-executor";
import { buildAgentOverview } from "../workbook/overview";
import type { WorkbookController } from "../workbook/controller";
import type { UserEditBurst } from "./user-edits";
import { burstChipText, UserEditLog } from "./user-edits";

const TOOL_LABELS: Record<AgentToolName, string> = {
	get_workbook_overview: "Scanning workbook",
	read_range: "Reading",
	set_cells: "Writing",
	fill_range: "Filling",
	clear_range: "Clearing",
	format_range: "Formatting",
	modify_structure: "Restructuring",
	add_sheet: "Adding sheet",
	rename_sheet: "Renaming sheet",
	rename_workbook: "Renaming workbook",
	undo: "Undoing",
	highlight_cells: "Highlighting",
};

// The empty state has to teach the feature, not just describe it: this panel is
// the product's differentiator and previously opened as two lines of prose with
// nothing to click.
const SUGGESTIONS = [
	"Build a 12-month budget with totals",
	"Add a column that flags rows above average",
	"Clean up this data and explain what you changed",
];

function isAgentToolName(name: string): name is AgentToolName {
	return name in agentToolSchemas;
}

/**
 * A burst of the user's own edits, shown as a passive transcript line — the
 * visual twin of the agent's tool rows, in the user's pencil rather than the
 * agent's dot. Never a message: the agent receives these as context on the
 * next turn and is told not to respond to them.
 */
function UserEditChip({
	burst,
	multiSheet,
}: {
	burst: UserEditBurst;
	multiSheet: boolean;
}) {
	return (
		<div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
			<PencilLineIcon className="size-3 shrink-0" />
			<span className="truncate">{burstChipText(burst, multiSheet)}</span>
		</div>
	);
}

export function ChatPanel({
	controller,
	renameDocument,
}: {
	controller: WorkbookController;
	renameDocument?: (name: string) => Promise<boolean>;
}) {
	const [input, setInput] = useState("");
	const [setupOpen, setSetupOpen] = useState(false);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	// The user-delta echo: cells the user edits by hand accumulate here, show
	// as passive chips in the transcript, and reach the agent at the earliest
	// seam — appended to its next tool result mid-task (the executor drains
	// them), or attached to the next user message between turns.
	const editLog = useMemo(() => new UserEditLog(), []);
	const executor = useMemo(
		() =>
			new AgentExecutor(controller, renameDocument, () =>
				editLog.takePendingText(),
			),
		[controller, renameDocument, editLog],
	);
	const lastMessageIdRef = useRef<string | null>(null);
	// Whether the view is pinned to the newest message. Only then does new
	// content scroll — otherwise reading back through history during a stream
	// is impossible, because every token yanks you to the bottom.
	const pinned = useRef(true);

	// Every request carries a fresh workbook sketch (the user may have edited
	// cells since the last turn), injected server-side into the latest user
	// message so the cached prompt prefix stays intact.
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				prepareSendMessagesRequest: async ({ id, messages, body }) => {
					// Only a plain user turn consumes the pending user edits —
					// tool-loop continuations must not clear them (the route
					// ignores the attachments on those requests anyway).
					const last = messages[messages.length - 1];
					const isUserTurn =
						last?.role === "user" &&
						last.parts.some((part) => part.type === "text");
					return {
						body: {
							id,
							messages,
							overview: (await buildAgentOverview(controller)).slice(
								0,
								16000,
							),
							...(isUserTurn
								? { userEdits: editLog.takePendingText() }
								: {}),
							...body,
						},
					};
				},
			}),
		[controller, editLog],
	);

	const { messages, sendMessage, addToolOutput, status, error, stop, regenerate } =
		useChat({
			transport,
			sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
			async onToolCall({ toolCall }) {
				if (toolCall.dynamic) return;
				const name = toolCall.toolName;
				if (!isAgentToolName(name)) return;
				const output = await executor.execute(name, toolCall.input);
				addToolOutput({ tool: name, toolCallId: toolCall.toolCallId, output });
			},
		});

	// Anchor for user-edit bursts: the newest message at the moment of the edit.
	lastMessageIdRef.current = messages[messages.length - 1]?.id ?? null;

	// Record the user's hand: every user-authored mutation lands in the edit
	// log with its delta echo. Agent mutations are excluded — the transcript
	// already shows those as tool calls.
	useEffect(
		() =>
			controller.onMutation((changes, author) => {
				if (author !== "user" || changes.length === 0) return;
				const sheets = controller.sheets();
				editLog.record(
					changes,
					(index) => sheets[index]?.name ?? `Sheet ${index + 1}`,
					lastMessageIdRef.current,
				);
			}),
		[controller, editLog],
	);

	const bursts = useSyncExternalStore(
		editLog.subscribe,
		editLog.getBursts,
		editLog.getBursts,
	);
	const burstsByAnchor = useMemo(() => {
		const map = new Map<string | null, UserEditBurst[]>();
		for (const burst of bursts) {
			const list = map.get(burst.afterMessageId) ?? [];
			list.push(burst);
			map.set(burst.afterMessageId, list);
		}
		return map;
	}, [bursts]);
	const multiSheet = controller.sheets().length > 1;

	// Presence: reset agent status when the turn ends.
	useEffect(() => {
		if (status !== "streaming" && status !== "submitted") {
			controller.setAgentStatus({ phase: "idle" });
		}
	}, [controller, status]);

	const onScroll = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		// 24px of slack so a near-bottom position still counts as pinned.
		pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
	}, []);

	useEffect(() => {
		const el = scrollRef.current;
		if (el && pinned.current) el.scrollTop = el.scrollHeight;
	}, [messages, bursts]);

	const busy = status === "streaming" || status === "submitted";

	const send = (text: string) => {
		if (!text.trim() || busy) return;
		// Gate: if the user hasn't set up inference (they may have chosen "look
		// around first"), pop the setup instead of sending — and keep their text.
		if (!isInferenceConfigured()) {
			setSetupOpen(true);
			return;
		}
		pinned.current = true;
		setInput("");
		void sendMessage({ text: text.trim() });
	};

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		send(input);
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
				<SparklesIcon className="size-3.5 text-agent" />
				<span className="text-xs font-medium">Agent</span>
				<AgentStatusChip controller={controller} busy={busy} />
			</div>

			<div
				ref={scrollRef}
				onScroll={onScroll}
				className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3"
			>
				{messages.length === 0 ? (
					<div className="mt-6 space-y-3 px-1">
						<p className="text-sm text-muted-foreground">
							Ask for anything — build a table, write formulas, clean up
							data. You&apos;ll see the agent work in the grid, live.
						</p>
						<div className="flex flex-col gap-1.5">
							{SUGGESTIONS.map((suggestion) => (
								<button
									key={suggestion}
									type="button"
									onClick={() => send(suggestion)}
									className="rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
								>
									{suggestion}
								</button>
							))}
						</div>
					</div>
				) : null}

				{(burstsByAnchor.get(null) ?? []).map((burst) => (
					<UserEditChip
						key={burst.id}
						burst={burst}
						multiSheet={multiSheet}
					/>
				))}

				{messages.map((message) => (
					<Fragment key={message.id}>
						<div className="space-y-1.5">
							{message.parts.map((part, index) => {
								if (part.type === "text") {
									if (!part.text) return null;
									if (message.role === "user") {
										return (
											<div
												key={`${message.id}-${index}`}
												className="ml-6 rounded-lg border border-border bg-accent px-3 py-2 text-sm whitespace-pre-wrap"
											>
												{part.text}
											</div>
										);
									}
									return (
										<div
											key={`${message.id}-${index}`}
											// Streamdown, not whitespace-pre-wrap: the model
											// writes markdown, and every **bold**, list and
											// table used to render as literal syntax. It also
											// copes with half-finished markdown mid-stream.
											className="px-1 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_ul]:list-disc [&_ul]:pl-5"
										>
											<Streamdown>{part.text}</Streamdown>
										</div>
									);
								}
								if (isToolUIPart(part)) {
									const name = part.type.replace(/^tool-/, "");
									const label = isAgentToolName(name)
										? TOOL_LABELS[name]
										: name;
									const running =
										part.state === "input-streaming" ||
										part.state === "input-available";
									const output =
										typeof part.output === "string"
											? part.output
											: "";
									const failed =
										part.state === "output-available" &&
										output.startsWith("error:");
									return (
										<div
											key={part.toolCallId}
											className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
										>
											{running ? (
												<Loader2Icon className="size-3 shrink-0 animate-spin text-agent" />
											) : failed ? (
												<CircleAlertIcon className="size-3 shrink-0 text-destructive-ink" />
											) : (
												<span className="size-1.5 shrink-0 rounded-full bg-agent" />
											)}
											<span
												className={cn(
													failed && "text-destructive-ink",
												)}
											>
												{label}
											</span>
											<ToolTarget input={part.input} />
											{/* The actual error was previously discarded —
										    only a red icon survived. */}
											{failed ? (
												<span
													className="truncate text-destructive-ink"
													title={output}
												>
													{output.replace(/^error:\s*/, "")}
												</span>
											) : null}
										</div>
									);
								}
								return null;
							})}
						</div>
						{(burstsByAnchor.get(message.id) ?? []).map((burst) => (
							<UserEditChip
								key={burst.id}
								burst={burst}
								multiSheet={multiSheet}
							/>
						))}
					</Fragment>
				))}

				{error ? (
					<div
						role="alert"
						className="space-y-2 rounded-md border border-destructive-ink/40 bg-destructive-ink/10 px-3 py-2 text-xs text-destructive-ink"
					>
						<p>{error.message || "Something went wrong — try again."}</p>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-6 px-2 text-[11px]"
							onClick={() => void regenerate()}
						>
							Retry
						</Button>
					</div>
				) : null}
			</div>

			{/*
			 * The agent's whole turn — status, each tool call, the reply — is
			 * visual-only otherwise. Polite so it never cuts across grid
			 * navigation.
			 */}
			<p className="sr-only" aria-live="polite" aria-atomic="true">
				{busy ? "Agent is working" : messages.length > 0 ? "Agent is idle" : ""}
			</p>

			<form onSubmit={submit} className="shrink-0 border-t border-border p-2">
				<div className="flex items-end gap-1.5 rounded-lg border border-input bg-background p-1.5 focus-within:ring-1 focus-within:ring-ring">
					<textarea
						value={input}
						aria-label="Message the agent"
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								submit(event);
							}
						}}
						rows={Math.min(4, Math.max(1, input.split("\n").length))}
						placeholder="Ask the agent…"
						className="max-h-32 flex-1 resize-none bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground"
					/>
					{busy ? (
						<Button
							type="button"
							size="icon"
							variant="secondary"
							className="size-7 shrink-0"
							aria-label="Stop"
							onClick={() => void stop()}
						>
							<SquareIcon className="size-3" />
						</Button>
					) : (
						<Button
							type="submit"
							size="icon"
							className="size-7 shrink-0"
							disabled={!input.trim()}
							aria-label="Send"
						>
							<ArrowUpIcon className="size-4" />
						</Button>
					)}
				</div>
			</form>

			<SetupWizard open={setupOpen} onOpenChange={setSetupOpen} />
		</div>
	);
}

function ToolTarget({ input }: { input: unknown }) {
	if (typeof input !== "object" || input === null) return null;
	const record: Record<string, unknown> = { ...input };
	const target =
		record.range ?? record.target_range ?? record.start_cell ?? record.sheet;
	if (typeof target !== "string") return null;
	// Was opacity-70 on already-muted text — muted-on-muted, under 4.5:1.
	return <span className="shrink-0 font-mono text-[11px]">{target}</span>;
}

function AgentStatusChip({
	controller,
	busy,
}: {
	controller: WorkbookController;
	busy: boolean;
}) {
	useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);
	const status = controller.agentStatus;
	if (!busy) return null;
	return (
		<span className="ml-auto truncate text-[11px] text-agent">
			{status.phase === "working" && status.detail ? status.detail : "thinking…"}
		</span>
	);
}

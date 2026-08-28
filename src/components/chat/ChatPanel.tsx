"use client";

import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
	type ToolUIPart,
} from "ai";
import {
	ArrowUpIcon,
	CheckIcon,
	CopyIcon,
	CornerDownLeftIcon,
	MessageSquarePlusIcon,
	PencilLineIcon,
	RotateCcwIcon,
	SparklesIcon,
	SquareDashedMousePointerIcon,
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

import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageAction,
	MessageActions,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
	getStatusBadge,
	Tool,
	ToolContent,
	ToolHeader,
	ToolOutput,
} from "@/components/ai-elements/tool";
import { SetupWizard } from "@/components/inference/SetupWizard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatRange, parseRange } from "@/lib/a1";
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

export function ChatPanel({
	controller,
	renameDocument,
}: {
	controller: WorkbookController;
	renameDocument?: (name: string) => Promise<boolean>;
}) {
	const [input, setInput] = useState("");
	const [setupOpen, setSetupOpen] = useState(false);
	const composerRef = useRef<HTMLTextAreaElement | null>(null);
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

	const {
		messages,
		sendMessage,
		addToolOutput,
		status,
		error,
		stop,
		regenerate,
		setMessages,
	} = useChat({
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

	const busy = status === "streaming" || status === "submitted";

	const send = (text: string) => {
		if (!text.trim() || busy) return;
		// Gate: if the user hasn't set up inference (they may have chosen "look
		// around first"), pop the setup instead of sending — and keep their text.
		if (!isInferenceConfigured()) {
			setSetupOpen(true);
			return;
		}
		setInput("");
		void sendMessage({ text: text.trim() });
	};

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		send(input);
	};

	/**
	 * Put the live selection into the message being written.
	 *
	 * The panel and the grid share one document, and the sentence the user is
	 * about to type almost always ends in a range. Without this they read the
	 * reference off the grid and re-type it, which is the one step in this
	 * product where a human does OCR for a machine that already knows.
	 */
	const insertSelection = useCallback(() => {
		const view = controller.selectedView();
		const reference = formatRange({
			startRow: Math.min(view.range[0], view.range[2]),
			startCol: Math.min(view.range[1], view.range[3]),
			endRow: Math.max(view.range[0], view.range[2]),
			endCol: Math.max(view.range[1], view.range[3]),
		});
		const sheets = controller.sheets();
		const name = sheets[view.sheet]?.name;
		// Qualify only when it disambiguates; "Sheet1!A1" in a one-sheet
		// workbook is noise the agent has to parse past.
		const target = sheets.length > 1 && name ? `${name}!${reference}` : reference;
		setInput((current) =>
			current === "" || current.endsWith(" ")
				? `${current}${target} `
				: `${current} ${target} `,
		);
		composerRef.current?.focus();
	}, [controller]);

	const newChat = useCallback(() => {
		setMessages([]);
		editLog.clear();
		setInput("");
		controller.clearHighlights();
		composerRef.current?.focus();
	}, [controller, editLog, setMessages]);

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
				<SparklesIcon className="size-3.5 shrink-0 text-agent" />
				<span className="text-xs font-medium">Agent</span>
				<AgentStatusChip controller={controller} busy={busy} />
				{/* Starting over used to mean reloading the tab, which also
				    throws away the workbook's unsaved state. */}
				{messages.length > 0 ? (
					<Tooltip>
						<TooltipTrigger
							render={
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									aria-label="New chat"
									disabled={busy}
									className="-mr-1 ml-auto shrink-0 text-muted-foreground"
									onClick={newChat}
								>
									<MessageSquarePlusIcon className="size-3.5" />
								</Button>
							}
						/>
						<TooltipContent>New chat</TooltipContent>
					</Tooltip>
				) : null}
			</div>

			<Conversation className="min-h-0">
				<ConversationContent className="gap-4 p-3">
					{messages.length === 0 ? (
						<ConversationEmptyState className="p-0 pt-3 text-left">
							<p className="text-sm leading-relaxed text-muted-foreground">
								Ask for anything — build a table, write formulas, clean
								up data. You&apos;ll see the agent work in the grid,
								live.
							</p>
							{/*
							 * Upstream lays suggestions out as a horizontally
							 * scrolling row of pills. At this panel's width a
							 * full sentence would run off the edge behind a
							 * scrollbar, so they stack — the same component,
							 * turned down its other axis.
							 */}
							<Suggestions className="mt-3 w-full flex-col items-stretch gap-1.5">
								{SUGGESTIONS.map((suggestion) => (
									<Suggestion
										key={suggestion}
										suggestion={suggestion}
										size="sm"
										className="h-auto justify-start rounded-md px-2.5 py-1.5 text-left text-xs whitespace-normal text-muted-foreground hover:border-primary/40 hover:text-foreground"
										onClick={send}
									/>
								))}
							</Suggestions>
						</ConversationEmptyState>
					) : null}

					{(burstsByAnchor.get(null) ?? []).map((burst) => (
						<UserEditChip
							key={burst.id}
							burst={burst}
							multiSheet={multiSheet}
						/>
					))}

					{messages.map((message, index) => {
						const text = message.parts
							.filter((part) => part.type === "text")
							.map((part) => part.text)
							.join("");
						const isNewest = index === messages.length - 1;
						return (
							<Fragment key={message.id}>
								<Message
									from={message.role}
									className="max-w-full gap-1.5"
								>
									<MessageContent className="gap-1.5">
										{message.parts.map((part, partIndex) => {
											if (part.type === "text") {
												if (!part.text) return null;
												if (message.role === "user") {
													return (
														<span
															key={`${message.id}-${partIndex}`}
															className="whitespace-pre-wrap"
														>
															{part.text}
														</span>
													);
												}
												return (
													<MessageResponse
														key={`${message.id}-${partIndex}`}
														className="text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_code]:rounded [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_table]:block [&_table]:overflow-x-auto [&_table]:text-xs [&_ul]:list-disc [&_ul]:pl-5"
													>
														{part.text}
													</MessageResponse>
												);
											}
											// Every tool this app exposes is statically
											// declared in agent-tools, so a
											// dynamic-tool part means a name the
											// executor cannot run — nothing to show.
											if (
												isToolUIPart(part) &&
												part.type !== "dynamic-tool"
											) {
												return (
													<ToolRow
														key={part.toolCallId}
														controller={controller}
														part={part}
													/>
												);
											}
											return null;
										})}
									</MessageContent>
									{message.role === "assistant" && text.trim() ? (
										<MessageActions
											// Revealed on hover, and on focus —
											// never hover alone, or a keyboard
											// user tabs into a control drawn at
											// opacity 0.
											className={cn(
												"gap-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
												isNewest && !busy && "opacity-100",
											)}
										>
											<CopyAction text={text} />
											{isNewest && !busy ? (
												<MessageAction
													tooltip="Try this turn again"
													label="Try this turn again"
													className="size-6 text-muted-foreground"
													onClick={() => void regenerate()}
												>
													<RotateCcwIcon className="size-3" />
												</MessageAction>
											) : null}
										</MessageActions>
									) : null}
								</Message>
								{(burstsByAnchor.get(message.id) ?? []).map((burst) => (
									<UserEditChip
										key={burst.id}
										burst={burst}
										multiSheet={multiSheet}
									/>
								))}
							</Fragment>
						);
					})}

					{error ? (
						<div
							role="alert"
							className="space-y-2 rounded-md border border-destructive-ink/40 bg-destructive-ink/10 px-3 py-2 text-xs text-destructive-ink"
						>
							<p>
								{error.message || "Something went wrong — try again."}
							</p>
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
				</ConversationContent>

				{/*
				 * Reading back through a long run used to strand you: the panel
				 * stopped following, and the only way back to the live edge was
				 * to scroll it by hand. `title` because the control is a single
				 * glyph — the accessible name alone reaches assistive tech and
				 * leaves a sighted reader guessing.
				 */}
				<ConversationScrollButton
					size="icon-sm"
					aria-label="Jump to latest"
					title="Jump to latest"
					className="bottom-3 bg-popover shadow-md"
				/>
			</Conversation>

			{/*
			 * The agent's whole turn — status, each tool call, the reply — is
			 * visual-only otherwise. Polite so it never cuts across grid
			 * navigation.
			 */}
			<p className="sr-only" aria-live="polite" aria-atomic="true">
				{busy ? "Agent is working" : messages.length > 0 ? "Agent is idle" : ""}
			</p>

			<form onSubmit={submit} className="shrink-0 border-t border-border p-2">
				<div className="rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
					<Textarea
						ref={composerRef}
						value={input}
						aria-label="Message the agent"
						placeholder="Ask the agent…"
						// `field-sizing-content` grows the box with its content
						// where the browser supports it; `rows` keeps the same
						// behaviour approximately everywhere else, and the cap
						// stops a pasted essay from eating the transcript.
						rows={Math.min(4, Math.max(1, input.split("\n").length))}
						className="max-h-32 min-h-0 resize-none rounded-lg border-0 bg-transparent px-2.5 py-2 text-sm shadow-none focus-visible:border-0 focus-visible:ring-0 md:text-sm dark:bg-transparent"
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key !== "Enter" || event.shiftKey) return;
							// An IME's Enter accepts a candidate; committing the
							// message there would send a half-typed word.
							if (event.nativeEvent.isComposing) return;
							event.preventDefault();
							send(input);
						}}
					/>
					<div className="flex items-center gap-1 px-1.5 pb-1.5">
						<Tooltip>
							<TooltipTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label="Insert the selected range"
										className="shrink-0 text-muted-foreground"
										onClick={insertSelection}
									>
										<SquareDashedMousePointerIcon className="size-3.5" />
									</Button>
								}
							/>
							<TooltipContent>Insert the selected range</TooltipContent>
						</Tooltip>
						<SelectionHint controller={controller} />
						{busy ? (
							<Button
								type="button"
								size="icon-sm"
								variant="secondary"
								className="ml-auto shrink-0"
								aria-label="Stop the agent"
								onClick={() => void stop()}
							>
								<SquareIcon className="size-3" />
							</Button>
						) : (
							<Button
								type="submit"
								size="icon-sm"
								className="ml-auto shrink-0"
								disabled={!input.trim()}
								aria-label="Send"
							>
								<ArrowUpIcon className="size-4" />
							</Button>
						)}
					</div>
				</div>
				{/* An undiscovered shortcut is a shortcut nobody has. */}
				<p className="mt-1 px-1 text-[11px] text-muted-foreground">
					<CornerDownLeftIcon aria-hidden className="mr-1 inline size-2.5" />
					to send · Shift+Enter for a new line
				</p>
			</form>

			<SetupWizard open={setupOpen} onOpenChange={setSetupOpen} />
		</div>
	);
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

/**
 * Copy the reply, with the state change on the button rather than in a toast —
 * a toast for "copied" covers the thing you just copied.
 */
function CopyAction({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 2000);
		return () => clearTimeout(timer);
	}, [copied]);

	return (
		<MessageAction
			tooltip={copied ? "Copied" : "Copy reply"}
			label={copied ? "Copied" : "Copy reply"}
			className="size-6 text-muted-foreground"
			onClick={() => {
				void navigator.clipboard
					.writeText(text)
					.then(() => setCopied(true))
					.catch(() => {
						// No clipboard permission. Saying nothing is right here:
						// the reply is selectable text either way, and a toast
						// would cover it.
					});
			}}
		>
			{copied ? (
				<CheckIcon className="size-3" />
			) : (
				<CopyIcon className="size-3" />
			)}
		</MessageAction>
	);
}

/**
 * One tool call in the transcript.
 *
 * The delta echo is the authoritative account of what an edit did — the cell
 * pulses in the grid are best-effort decoration — so every finished call keeps
 * its result, folded away by default and one click from being read.
 */
function ToolRow({
	controller,
	part,
}: {
	controller: WorkbookController;
	part: ToolUIPart;
}) {
	const name = part.type.replace(/^tool-/, "");
	const label = isAgentToolName(name) ? TOOL_LABELS[name] : name;
	const output = typeof part.output === "string" ? part.output : "";
	const done = part.state === "output-available";
	// The executor reports a failed tool as an `error:` result rather than a
	// rejected call, so the transcript has to read the string to tell the two
	// apart — and then say so in the state the component renders.
	const failed = done && output.startsWith("error:");
	const detail = failed ? output.replace(/^error:\s*/, "") : output;
	const state = failed ? "output-error" : part.state;
	// A read that answered "" said nothing worth unfolding for.
	const inspectable = done && detail.trim() !== "";
	const target = <ToolTarget controller={controller} input={part.input} />;

	if (!inspectable) {
		return (
			<div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
				{getStatusBadge(state)}
				<span className="shrink-0">{label}</span>
				{target}
			</div>
		);
	}

	return (
		<Tool className="mb-0 rounded-none border-0">
			<ToolHeader type={part.type} state={state} title={label}>
				{target}
			</ToolHeader>
			<ToolContent className="space-y-1 p-0 pt-1.5 pb-1 pl-4">
				<ToolOutput
					output={failed ? undefined : detail}
					errorText={failed ? detail : undefined}
				/>
			</ToolContent>
		</Tool>
	);
}

/**
 * The range a tool acted on — and a way to go there.
 *
 * "Writing B2:D10" naming a place you can't reach is a caption, not evidence.
 * Clicking it switches to that sheet, selects the range and scrolls it into
 * view, so verifying the agent's claim is one click rather than a manual hunt.
 */
function ToolTarget({
	controller,
	input,
}: {
	controller: WorkbookController;
	input: unknown;
}) {
	if (typeof input !== "object" || input === null) return null;
	const record: Record<string, unknown> = { ...input };
	const target =
		record.range ?? record.target_range ?? record.start_cell ?? record.sheet;
	if (typeof target !== "string") return null;

	// "Sheet2!B2:D10" — the qualifier is optional, and a tool that took a plain
	// `sheet` argument names its sheet there instead.
	const separator = target.indexOf("!");
	const qualifier = separator === -1 ? null : target.slice(0, separator);
	const sheetName =
		qualifier ?? (typeof record.sheet === "string" ? record.sheet : null);
	const range = parseRange(target.slice(separator + 1));

	if (!range) {
		// A bare sheet name, or something we can't resolve — still shown, just
		// not offered as a destination.
		// Was opacity-70 on already-muted text — muted-on-muted, under 4.5:1.
		return <span className="shrink-0 font-mono text-[11px]">{target}</span>;
	}

	const go = () => {
		const index = sheetName
			? controller.sheets().findIndex((sheet) => sheet.name === sheetName)
			: -1;
		controller.view((model) => {
			if (index >= 0) model.setSelectedSheet(index);
			model.setSelectedCell(range.startRow, range.startCol);
			model.setSelectedRange(
				range.startRow,
				range.startCol,
				range.endRow,
				range.endCol,
			);
		});
		controller.reveal();
	};

	return (
		<button
			type="button"
			title={`Select ${target} in the grid`}
			className="shrink-0 rounded-sm font-mono text-[11px] underline decoration-dotted underline-offset-2 hover:text-foreground"
			onClick={go}
		>
			{target}
		</button>
	);
}

/** What "Insert the selected range" would insert, right now. */
function SelectionHint({ controller }: { controller: WorkbookController }) {
	useSyncExternalStore(
		controller.subscribe,
		controller.getVersion,
		controller.getVersion,
	);
	const view = controller.selectedView();
	const reference = formatRange({
		startRow: Math.min(view.range[0], view.range[2]),
		startCol: Math.min(view.range[1], view.range[3]),
		endRow: Math.max(view.range[0], view.range[2]),
		endCol: Math.max(view.range[1], view.range[3]),
	});
	return (
		<span
			aria-hidden
			className="min-w-0 truncate font-mono text-[11px] text-muted-foreground"
		>
			{reference}
		</span>
	);
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

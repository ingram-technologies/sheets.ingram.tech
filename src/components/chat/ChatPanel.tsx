"use client";

import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	isToolUIPart,
	lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { ArrowUp, CircleAlert, Loader2, Sparkles, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import type { AgentToolName } from "@/lib/agent-tools";
import { agentToolSchemas } from "@/lib/agent-tools";
import { cn } from "@/lib/utils";

import { AgentExecutor, buildWorkbookOverview } from "../workbook/agent-executor";
import type { WorkbookController } from "../workbook/controller";

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
	undo: "Undoing",
	highlight_cells: "Highlighting",
};

function isAgentToolName(name: string): name is AgentToolName {
	return name in agentToolSchemas;
}

export function ChatPanel({ controller }: { controller: WorkbookController }) {
	const executor = useMemo(() => new AgentExecutor(controller), [controller]);
	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement | null>(null);

	// Every request carries a fresh workbook sketch (the user may have edited
	// cells since the last turn), injected server-side into the latest user
	// message so the cached prompt prefix stays intact.
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/chat",
				prepareSendMessagesRequest: ({ id, messages, body }) => ({
					body: {
						id,
						messages,
						overview: buildWorkbookOverview(controller).slice(0, 16000),
						...body,
					},
				}),
			}),
		[controller],
	);

	const { messages, sendMessage, addToolOutput, status, error, stop } = useChat({
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

	// Presence: reset agent status when the turn ends.
	useEffect(() => {
		if (status !== "streaming" && status !== "submitted") {
			controller.setAgentStatus({ phase: "idle" });
		}
	}, [controller, status]);

	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages]);

	const busy = status === "streaming" || status === "submitted";

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		const text = input.trim();
		if (!text || busy) return;
		setInput("");
		void sendMessage({ text });
	};

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
				<Sparkles className="size-3.5 text-[var(--sheet-agent)]" />
				<span className="text-xs font-medium">Agent</span>
				<AgentStatusChip controller={controller} busy={busy} />
			</div>

			<div
				ref={scrollRef}
				className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3"
			>
				{messages.length === 0 ? (
					<div className="mt-8 space-y-2 px-2 text-center">
						<p className="text-sm text-muted-foreground">
							Ask for anything — build a table, write formulas, clean up
							data.
						</p>
						<p className="text-xs text-muted-foreground/70">
							You&apos;ll see the agent work in the grid, live.
						</p>
					</div>
				) : null}
				{messages.map((message) => (
					<div key={message.id} className="space-y-1.5">
						{message.parts.map((part, index) => {
							if (part.type === "text") {
								if (!part.text) return null;
								return (
									<div
										key={`${message.id}-${index}`}
										className={cn(
											"text-sm whitespace-pre-wrap",
											message.role === "user"
												? "ml-6 rounded-lg bg-accent px-3 py-2"
												: "px-1 leading-relaxed",
										)}
									>
										{part.text}
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
								const failed =
									part.state === "output-available" &&
									typeof part.output === "string" &&
									part.output.startsWith("error:");
								return (
									<div
										key={part.toolCallId}
										className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
									>
										{running ? (
											<Loader2 className="size-3 animate-spin text-[var(--sheet-agent)]" />
										) : failed ? (
											<CircleAlert className="size-3 text-warning" />
										) : (
											<span className="size-1.5 rounded-full bg-[var(--sheet-agent)]" />
										)}
										<span>{label}</span>
										<ToolTarget input={part.input} />
									</div>
								);
							}
							return null;
						})}
					</div>
				))}
				{error ? (
					<div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						{error.message || "Something went wrong — try again."}
					</div>
				) : null}
			</div>

			<form onSubmit={submit} className="shrink-0 border-t border-border p-2">
				<div className="flex items-end gap-1.5 rounded-lg border border-input bg-background p-1.5 focus-within:ring-1 focus-within:ring-ring">
					<textarea
						value={input}
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
							<Square className="size-3" />
						</Button>
					) : (
						<Button
							type="submit"
							size="icon"
							className="size-7 shrink-0"
							disabled={!input.trim()}
							aria-label="Send"
						>
							<ArrowUp className="size-4" />
						</Button>
					)}
				</div>
			</form>
		</div>
	);
}

function ToolTarget({ input }: { input: unknown }) {
	if (typeof input !== "object" || input === null) return null;
	const record: Record<string, unknown> = { ...input };
	const target =
		record.range ?? record.target_range ?? record.start_cell ?? record.sheet;
	if (typeof target !== "string") return null;
	return <span className="font-mono text-[11px] opacity-70">{target}</span>;
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
		<span className="ml-auto truncate text-[11px] text-[var(--sheet-agent)]">
			{status.phase === "working" && status.detail ? status.detail : "thinking…"}
		</span>
	);
}

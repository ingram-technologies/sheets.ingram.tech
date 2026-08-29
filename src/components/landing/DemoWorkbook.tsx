"use client";

import {
	CircleAlertIcon,
	Loader2Icon,
	RotateCcwIcon,
	SparklesIcon,
} from "lucide-react";
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Streamdown } from "streamdown";

import type { AgentToolName } from "@/lib/agent-tools";
import { cn } from "@/lib/utils";

import { AgentExecutor } from "../workbook/agent-executor";
import { WorkbookController } from "../workbook/controller";
import type { EditingState } from "../workbook/Grid";
import { Grid } from "../workbook/Grid";
import { ensureIronCalc, Model } from "../workbook/ironcalc";

// Labels mirror ChatPanel's — only the verbs this script actually uses.
const TOOL_LABELS: Partial<Record<AgentToolName, string>> = {
	set_cells: "Writing",
	format_range: "Formatting",
	highlight_cells: "Highlighting",
};

/**
 * A recorded agent session on the real widgets. It builds a genuine IronCalc
 * model in the browser, wraps it in the real WorkbookController, and replays a
 * scripted conversation through the real AgentExecutor — so the grid animates
 * with the same focus outline, sheet pulses, and highlights the live agent
 * drives. No sign-in, no server, no inference: the script stands in for the
 * model's tool calls, nothing else. The grid stays fully interactive after the
 * script finishes, so a visitor can poke the engine themselves.
 */

type DemoPart =
	| { type: "text"; text: string }
	| {
			type: "tool";
			name: AgentToolName;
			target?: string;
			state: "running" | "done" | "error";
			output?: string;
	  };

interface DemoMessage {
	id: string;
	role: "user" | "assistant";
	parts: DemoPart[];
}

type Step =
	| { kind: "user"; text: string }
	| { kind: "say"; text: string }
	| { kind: "tool"; name: AgentToolName; input: Record<string, unknown> }
	| { kind: "wait"; ms: number };

function buildScript(sheet: string): Step[] {
	return [
		{
			kind: "user",
			text: "Build a SaaS revenue model — plan, seats, price, monthly revenue, with a total.",
		},
		{ kind: "wait", ms: 700 },
		{
			kind: "tool",
			name: "set_cells",
			input: {
				sheet,
				start_cell: "A1",
				rows: [
					["Plan", "Seats", "Price", "MRR"],
					["Free", 1500, 0, "=B2*C2"],
					["Pro", 320, 29, "=B3*C3"],
					["Scale", 64, 99, "=B4*C4"],
					["Total", "=SUM(B2:B4)", null, "=SUM(D2:D4)"],
				],
			},
		},
		{ kind: "wait", ms: 550 },
		{
			kind: "tool",
			name: "format_range",
			input: { sheet, range: "A1:D1", bold: true },
		},
		{
			kind: "tool",
			name: "format_range",
			input: { sheet, range: "C2:D5", number_format: "$#,##0" },
		},
		{
			kind: "tool",
			name: "format_range",
			input: { sheet, range: "B2:B5", number_format: "#,##0" },
		},
		{
			kind: "tool",
			name: "format_range",
			input: { sheet, range: "A5:D5", bold: true },
		},
		{ kind: "wait", ms: 400 },
		{
			kind: "tool",
			name: "highlight_cells",
			input: { sheet, range: "D5", note: "Total MRR" },
		},
		{
			kind: "say",
			text: "Done. MRR is seats × price per plan, summed into the **Total** row. **D5** (highlighted) is the number that matters — Pro carries most of it.",
		},
		{ kind: "wait", ms: 1400 },
		{ kind: "user", text: "Flag any plan above the average MRR." },
		{ kind: "wait", ms: 650 },
		{
			kind: "tool",
			name: "set_cells",
			input: {
				sheet,
				start_cell: "E1",
				rows: [
					["Flag"],
					['=IF(D2>AVERAGE($D$2:$D$4),"▲ above","")'],
					['=IF(D3>AVERAGE($D$2:$D$4),"▲ above","")'],
					['=IF(D4>AVERAGE($D$2:$D$4),"▲ above","")'],
				],
			},
		},
		{
			kind: "tool",
			name: "format_range",
			input: { sheet, range: "E1", bold: true },
		},
		{ kind: "wait", ms: 350 },
		{
			kind: "tool",
			name: "highlight_cells",
			input: { sheet, range: "E2:E4", note: "Above the average" },
		},
		{
			kind: "say",
			text: "Added a **Flag** column that marks any plan beating the three-plan average. Pro clears it.",
		},
	];
}

function targetOf(input: Record<string, unknown>): string | undefined {
	const t = input.range ?? input.start_cell ?? input.target_range;
	return typeof t === "string" ? t : undefined;
}

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function DemoWorkbook() {
	const [started, setStarted] = useState(false);
	const [runId, replay] = useReducer((n: number) => n + 1, 0);
	const [controller, setController] = useState<WorkbookController | null>(null);
	const [messages, setMessages] = useState<DemoMessage[]>([]);
	const [busy, setBusy] = useState(false);
	const [done, setDone] = useState(false);
	const [editing, setEditing] = useState<EditingState | null>(null);
	const frameRef = useRef<HTMLDivElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);

	// Clearing the previous run is a reset, so it happens during render off a
	// run-id sentinel. From inside the replay effect it painted one frame of the
	// finished transcript before blanking it, which read as a flash of the old
	// answer every time Replay was pressed.
	const runKey = started ? runId : null;
	const [clearedRun, setClearedRun] = useState<number | null>(null);
	if (runKey !== clearedRun) {
		setClearedRun(runKey);
		setMessages([]);
		setDone(false);
		setBusy(false);
	}

	// Load the engine and start only once the demo scrolls into view — keeps the
	// wasm off the initial landing paint.
	useEffect(() => {
		if (started) return;
		const el = frameRef.current;
		if (!el) return;
		const io = new IntersectionObserver(
			(entries) => {
				if (entries.some((e) => e.isIntersecting)) {
					setStarted(true);
					io.disconnect();
				}
			},
			{ threshold: 0.35 },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [started]);

	// Build a fresh model + controller and replay the script. Re-runs on Replay.
	useEffect(() => {
		if (!started) return;
		let alive = true;
		let model: Model | null = null;
		let ctrl: WorkbookController | null = null;

		const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
		const reduced = prefersReducedMotion();
		const scale = reduced ? 0.25 : 1;

		const pushUser = (text: string) => {
			setMessages((m) => [
				...m,
				{ id: `u${m.length}`, role: "user", parts: [{ type: "text", text }] },
				{ id: `a${m.length}`, role: "assistant", parts: [] },
			]);
		};
		const appendPart = (part: DemoPart) => {
			setMessages((m) => {
				const last = m[m.length - 1];
				if (!last || last.role !== "assistant") return m;
				return [...m.slice(0, -1), { ...last, parts: [...last.parts, part] }];
			});
		};
		const patchLastTool = (state: "done" | "error", output: string) => {
			setMessages((m) => {
				const last = m[m.length - 1];
				if (!last) return m;
				const parts = [...last.parts];
				for (let i = parts.length - 1; i >= 0; i--) {
					const p = parts[i];
					if (p && p.type === "tool") {
						parts[i] = { ...p, state, output };
						break;
					}
				}
				return [...m.slice(0, -1), { ...last, parts }];
			});
		};
		const streamText = async (text: string) => {
			appendPart({ type: "text", text: reduced ? text : "" });
			if (reduced) return;
			const words = text.split(" ");
			let acc = "";
			for (const word of words) {
				if (!alive) return;
				acc = acc ? `${acc} ${word}` : word;
				const snapshot = acc;
				setMessages((m) => {
					const last = m[m.length - 1];
					if (!last || last.role !== "assistant") return m;
					const parts = [...last.parts];
					const li = parts.length - 1;
					const p = parts[li];
					if (p && p.type === "text")
						parts[li] = { type: "text", text: snapshot };
					return [...m.slice(0, -1), { ...last, parts }];
				});
				await sleep(28);
			}
		};

		async function run() {
			await ensureIronCalc();
			if (!alive) return;
			const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
			model = new Model("Demo", "en", tz, "en");
			ctrl = new WorkbookController(model);
			if (!alive) {
				model.free();
				return;
			}
			setController(ctrl);
			const executor = new AgentExecutor(ctrl);
			const sheet = ctrl.sheets()[0]?.name ?? "Sheet1";
			const script = buildScript(sheet);

			await sleep(500 * scale);
			for (const step of script) {
				if (!alive) return;
				if (step.kind === "user") {
					pushUser(step.text);
					setBusy(true);
				} else if (step.kind === "wait") {
					await sleep(step.ms * scale);
				} else if (step.kind === "say") {
					setBusy(false);
					ctrl.setAgentStatus({ phase: "idle" });
					await streamText(step.text);
				} else {
					appendPart({
						type: "tool",
						name: step.name,
						target: targetOf(step.input),
						state: "running",
					});
					await sleep(reduced ? 0 : 450);
					if (!alive) return;
					const output = await executor.execute(step.name, step.input);
					patchLastTool(
						output.startsWith("error:") ? "error" : "done",
						output,
					);
					await sleep(reduced ? 0 : 320);
				}
			}
			if (alive) {
				setBusy(false);
				ctrl.setAgentStatus({ phase: "idle" });
				setDone(true);
			}
		}
		void run();

		return () => {
			alive = false;
			// Free the engine model; the controller holds no other resources.
			try {
				model?.free();
			} catch {
				// already freed
			}
		};
	}, [started, runId]);

	// Keep the transcript pinned to the newest line as it streams.
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [messages]);

	return (
		<div
			ref={frameRef}
			className="overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/40"
		>
			{/* App-style titlebar */}
			<div className="flex items-center gap-2 border-b border-border px-3 py-2">
				<span className="flex gap-1.5" aria-hidden>
					<span className="size-2.5 rounded-full bg-muted-foreground/25" />
					<span className="size-2.5 rounded-full bg-muted-foreground/25" />
					<span className="size-2.5 rounded-full bg-muted-foreground/25" />
				</span>
				<span className="ml-1 font-mono text-[11px] text-muted-foreground">
					revenue-model
				</span>
				<span className="ml-auto flex items-center gap-2">
					<span className="hidden text-[11px] text-muted-foreground sm:inline">
						Recorded · no sign-in
					</span>
					{done ? (
						<button
							type="button"
							onClick={replay}
							className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
						>
							<RotateCcwIcon className="size-3" />
							Replay
						</button>
					) : null}
				</span>
			</div>

			<div className="flex flex-col md:flex-row">
				<div className="h-64 min-w-0 md:h-[440px] md:flex-1">
					{controller ? (
						<Grid
							controller={controller}
							editing={editing}
							setEditing={setEditing}
						/>
					) : (
						<div className="flex h-full items-center justify-center text-xs text-muted-foreground">
							Loading engine…
						</div>
					)}
				</div>

				<DemoChat
					controller={controller}
					messages={messages}
					busy={busy}
					scrollRef={scrollRef}
				/>
			</div>
		</div>
	);
}

function DemoChat({
	controller,
	messages,
	busy,
	scrollRef,
}: {
	controller: WorkbookController | null;
	messages: DemoMessage[];
	busy: boolean;
	scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
	return (
		<div className="flex h-56 min-h-0 flex-col border-t border-border md:h-[440px] md:w-80 md:border-t-0 md:border-l xl:w-96">
			<div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
				<SparklesIcon className="size-3.5 text-agent" />
				<span className="text-xs font-medium">Agent</span>
				{controller ? <StatusChip controller={controller} busy={busy} /> : null}
			</div>

			<div
				ref={scrollRef}
				className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3"
			>
				{messages.length === 0 ? (
					<p className="mt-2 px-1 text-sm text-muted-foreground">
						A recorded session — the agent builds a model in the grid to the
						left.
					</p>
				) : null}

				{messages.map((message) => (
					<div key={message.id} className="space-y-1.5">
						{message.parts.map((part, index) => {
							if (part.type === "text") {
								if (!part.text) return null;
								if (message.role === "user") {
									return (
										<div
											key={index}
											className="ml-6 rounded-lg border border-border bg-accent px-3 py-2 text-sm whitespace-pre-wrap"
										>
											{part.text}
										</div>
									);
								}
								return (
									<div
										key={index}
										className="px-1 text-sm leading-relaxed [&_code]:rounded [&_code]:bg-accent [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_p]:my-2"
									>
										<Streamdown>{part.text}</Streamdown>
									</div>
								);
							}
							const label = TOOL_LABELS[part.name] ?? part.name;
							const failed = part.state === "error";
							return (
								<div
									key={index}
									className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground"
								>
									{part.state === "running" ? (
										<Loader2Icon className="size-3 shrink-0 animate-spin text-agent" />
									) : failed ? (
										<CircleAlertIcon className="size-3 shrink-0 text-destructive-ink" />
									) : (
										<span className="size-1.5 shrink-0 rounded-full bg-agent" />
									)}
									<span
										className={cn(failed && "text-destructive-ink")}
									>
										{label}
									</span>
									{part.target ? (
										<span className="shrink-0 font-mono text-[11px]">
											{part.target}
										</span>
									) : null}
								</div>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}

function StatusChip({
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
	if (!busy) return null;
	const status = controller.agentStatus;
	return (
		<span className="ml-auto truncate text-[11px] text-agent">
			{status.phase === "working" && status.detail ? status.detail : "thinking…"}
		</span>
	);
}

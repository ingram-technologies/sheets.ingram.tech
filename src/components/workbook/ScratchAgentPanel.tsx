"use client";

import { MonitorIcon } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { webMcpSupported } from "@/lib/webmcp";

import type { WebMcpCall } from "./webmcp-log";

/**
 * What stands where the chat panel stands on a signed-in workbook.
 *
 * The scratch workbook has no account, so it has no Ingram Cloud project to run
 * a model in — the only agent available is the one already driving the browser.
 * The conversation with that agent happens outside this tab, which would leave
 * the person watching cells change with no idea what asked for them. So the
 * panel is a call log: every tool the agent ran, and the result it got back,
 * delta echo and all.
 */

function subscribeNever(): () => void {
	return () => {};
}

export function ScratchAgentPanel({ calls }: { calls: WebMcpCall[] }) {
	const supported = useSyncExternalStore(
		subscribeNever,
		webMcpSupported,
		() => false,
	);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3 text-sm font-medium">
				<MonitorIcon className="size-4 shrink-0 text-primary" />
				Your browser&rsquo;s agent
				{calls.length > 0 ? (
					<span className="ml-auto font-mono text-[11px] font-normal text-muted-foreground">
						{calls.length} call{calls.length === 1 ? "" : "s"}
					</span>
				) : null}
			</div>

			{calls.length === 0 ? (
				<div className="flex-1 space-y-3 overflow-y-auto p-4">
					{supported ? (
						<>
							<p className="text-xs leading-relaxed text-muted-foreground">
								Waiting for your agent. This sheet has published twelve
								tools &mdash; read ranges, write cells, extend formulas,
								point at things &mdash; and every call it makes will
								show up here.
							</p>
							{/*
							 * A page cannot tell whether an agent is attached: the API
							 * being present only means the browser supports it. So the
							 * "how do I even talk to it" answer stays available and
							 * stays shut, rather than lecturing someone who is already
							 * standing in the right browser.
							 */}
							<details className="group rounded-md border border-border bg-muted/40">
								<summary className="cursor-pointer list-none p-3 text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
									<span className="inline-block transition-transform group-open:rotate-90">
										&rsaquo;
									</span>{" "}
									How do I talk to it?
								</summary>
								<div className="space-y-1.5 px-3 pb-3">
									<p className="text-xs leading-relaxed text-muted-foreground">
										The agent is your browser&rsquo;s, not ours, so
										there is no chat box here &mdash; you talk to it
										where it lives. Open the{" "}
										<b className="font-medium text-foreground">
											ChatGPT desktop app
										</b>
										, use its built-in browser to come back to this
										page, then just ask. An arrow in the address bar
										turns blue while it works.
									</p>
									<p className="text-xs leading-relaxed text-muted-foreground">
										Site tools need GPT-5.6 Sol or Terra &mdash;
										Luna has them switched off. If it starts
										clicking around the page instead of calling
										tools, tell it to use the site tools.
									</p>
								</div>
							</details>
							<p className="text-xs leading-relaxed text-muted-foreground">
								The workbook is never uploaded to us: the engine runs in
								this tab and the sheet is kept in this browser&rsquo;s
								storage. Only the ranges the agent asks for go to
								whoever runs the agent.
							</p>
						</>
					) : (
						<>
							<p className="text-xs leading-relaxed text-muted-foreground">
								This browser has no WebMCP support, so there is no agent
								to hand the sheet to. The grid works anyway &mdash; it
								always did.
							</p>
							<p className="text-xs leading-relaxed text-muted-foreground">
								To see the tools work, open this page in the{" "}
								<b className="font-medium text-foreground">
									ChatGPT desktop app&rsquo;s built-in browser
								</b>{" "}
								and ask it to build something. Chrome 149 and up can
								switch the API on at{" "}
								<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
									chrome://flags/#enable-webmcp-testing
								</code>
								, but a plain Chrome tab has no agent attached to call
								them.
							</p>
						</>
					)}
				</div>
			) : (
				<ol className="flex-1 overflow-y-auto">
					{calls.map((call) => (
						<li
							key={call.id}
							className="border-b border-border px-4 py-2.5 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
						>
							<div className="flex items-baseline gap-2">
								<code className="font-mono text-[12px] font-medium text-primary">
									{call.name}
								</code>
								{call.changed !== null ? (
									<span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
										{call.changed} changed
									</span>
								) : null}
							</div>
							{call.args ? (
								<p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
									{call.args}
								</p>
							) : null}
							<p className="mt-1 line-clamp-2 font-mono text-[11px] leading-relaxed text-foreground/70">
								{call.result}
							</p>
						</li>
					))}
				</ol>
			)}

			<div className="shrink-0 border-t border-border p-4">
				<p className="text-xs leading-relaxed text-muted-foreground">
					Want an agent that keeps your workbooks and remembers the
					conversation?{" "}
					<Link href="/login" className="text-primary underline">
						Sign in
					</Link>
					.
				</p>
			</div>
		</div>
	);
}

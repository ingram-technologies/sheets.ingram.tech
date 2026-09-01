"use client";

import { MonitorIcon } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { webMcpSupported } from "@/lib/webmcp";

/**
 * What stands where the chat panel stands on a signed-in workbook. The scratch
 * workbook has no account, so it has no Ingram Cloud project to run a model in
 * — the only agent available is the one already driving the browser, and this
 * says whether the browser can hand it the sheet.
 */

function subscribeNever(): () => void {
	return () => {};
}

export function ScratchAgentPanel() {
	const supported = useSyncExternalStore(
		subscribeNever,
		webMcpSupported,
		() => false,
	);

	return (
		<div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
			<div className="flex items-center gap-2 text-sm font-medium">
				<MonitorIcon className="size-4 shrink-0 text-primary" />
				Your browser&rsquo;s agent
			</div>

			{supported ? (
				<>
					<p className="text-xs leading-relaxed text-muted-foreground">
						This sheet has published its tools. Ask ChatGPT to work in this
						tab and it can read ranges, write cells, extend formulas and
						point at things &mdash; and you will watch it happen.
					</p>
					<p className="text-xs leading-relaxed text-muted-foreground">
						Nothing here reaches our servers. The engine is in your browser
						and the sheet is kept in this browser&rsquo;s storage.
					</p>
				</>
			) : (
				<p className="text-xs leading-relaxed text-muted-foreground">
					This browser has no WebMCP support, so there is no agent to hand the
					sheet to. Chrome 149 and up can turn it on at{" "}
					<code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">
						chrome://flags/#enable-webmcp-testing
					</code>
					. The grid works either way.
				</p>
			)}

			<div className="mt-auto border-t border-border pt-4">
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

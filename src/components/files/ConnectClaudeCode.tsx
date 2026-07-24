"use client";

import { CheckIcon, CopyIcon, TerminalIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

/**
 * How a Claude Code user connects their terminal to these workbooks.
 *
 * One command, and no credential to copy: the MCP endpoint advertises an
 * OAuth authorization server, so `claude mcp add` opens a browser, the user
 * signs in as themselves, and the client registers itself. There is nothing
 * here to paste into a config file and nothing to leak — which is why this
 * dialog shows a command rather than a token.
 *
 * The origin is read at runtime rather than hardcoded so the command is
 * correct on a preview deployment and on localhost, not just in production.
 */
export function ConnectClaudeCode() {
	const [open, setOpen] = useState(false);
	const [origin, setOrigin] = useState("");
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);

	const command = `claude mcp add --transport http sheets ${origin}/api/mcp`;

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(command);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Couldn't copy — select the command and copy it manually");
		}
	};

	return (
		<>
			<Button
				variant="ghost"
				size="icon"
				title="Connect Claude Code"
				aria-label="Connect Claude Code"
				className="size-9 text-muted-foreground"
				onClick={() => setOpen(true)}
			>
				<TerminalIcon className="size-4" />
			</Button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Connect Claude Code</DialogTitle>
						<DialogDescription>
							Give Claude Code the ability to work in these workbooks from
							your terminal. Run this once:
						</DialogDescription>
					</DialogHeader>

					<div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
						<code className="min-w-0 flex-1 font-mono text-xs break-all text-foreground">
							{origin ? command : "…"}
						</code>
						<Button
							variant="outline"
							size="sm"
							className="h-7 shrink-0 px-2"
							disabled={!origin}
							onClick={() => void copy()}
						>
							{copied ? (
								<CheckIcon className="size-3.5" />
							) : (
								<CopyIcon className="size-3.5" />
							)}
							<span className="sr-only">Copy command</span>
						</Button>
					</div>

					<div className="space-y-2 text-xs text-muted-foreground">
						<p>
							Claude Code opens a browser to sign you in — there is no API
							key to create or paste. It then gets five tools over your
							workbooks: a structure-aware sketch instead of a cell dump,
							budgeted range views, and a command language that answers
							every edit with exactly which cells recalculated.
						</p>
						<p>
							Edits appear here live. Leave a workbook open in a tab and
							you will see the cells it touches flash as it works, with
							the script it ran shown above the grid.
						</p>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}

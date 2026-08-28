"use client";

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { DynamicToolUIPart, ToolUIPart } from "ai";
import {
	CheckCircleIcon,
	ChevronDownIcon,
	CircleAlertIcon,
	ClockIcon,
	Loader2Icon,
	XCircleIcon,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { isValidElement, useId } from "react";

export type ToolProps = ComponentProps<typeof Collapsible>;

export const Tool = ({ className, ...props }: ToolProps) => (
	<Collapsible
		className={cn("group not-prose mb-4 w-full rounded-md border", className)}
		{...props}
	/>
);

export type ToolPart = ToolUIPart | DynamicToolUIPart;

export type ToolHeaderProps = {
	title?: string;
	className?: string;
	/** Rendered after the title — e.g. the range this call acted on. */
	children?: ReactNode;
} & (
	| { type: ToolUIPart["type"]; state: ToolUIPart["state"]; toolName?: never }
	| {
			type: DynamicToolUIPart["type"];
			state: DynamicToolUIPart["state"];
			toolName: string;
	  }
);

const statusLabels: Record<ToolPart["state"], string> = {
	"approval-requested": "Awaiting Approval",
	"approval-responded": "Responded",
	"input-available": "Running",
	"input-streaming": "Pending",
	"output-available": "Completed",
	"output-denied": "Denied",
	"output-error": "Error",
};

const statusIcons: Record<ToolPart["state"], ReactNode> = {
	"approval-requested": <ClockIcon className="size-3 text-warning" />,
	"approval-responded": <CheckCircleIcon className="size-3 text-agent" />,
	"input-available": <Loader2Icon className="size-3 animate-spin text-agent" />,
	"input-streaming": <Loader2Icon className="size-3 animate-spin text-agent" />,
	"output-available": <span className="size-1.5 rounded-full bg-agent" />,
	"output-denied": <XCircleIcon className="size-3 text-muted-foreground" />,
	"output-error": <CircleAlertIcon className="size-3 text-destructive-ink" />,
};

export const getStatusBadge = (status: ToolPart["state"]) => (
	<span className="flex size-3 shrink-0 items-center justify-center">
		{statusIcons[status]}
		<span className="sr-only">{statusLabels[status]}</span>
	</span>
);

export const ToolHeader = ({
	className,
	title,
	type,
	state,
	toolName,
	children,
	...props
}: ToolHeaderProps) => {
	const derivedName =
		type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
	const titleId = useId();

	return (
		<div
			className={cn(
				"relative flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground",
				className,
			)}
			{...props}
		>
			{/*
			 * The trigger is a stretched overlay, not a wrapper: the row carries
			 * its own controls (the range target), and a button inside a button
			 * is invalid HTML that React refuses to hydrate. It still covers the
			 * whole row, and takes its name from the visible title.
			 */}
			<CollapsibleTrigger
				aria-labelledby={titleId}
				className="absolute inset-0 rounded-sm"
			/>
			{getStatusBadge(state)}
			<span className="shrink-0" id={titleId}>
				{title ?? derivedName}
			</span>
			{children ? (
				<span className="relative flex min-w-0 items-center gap-1.5">
					{children}
				</span>
			) : null}
			<ChevronDownIcon className="ml-auto size-3 shrink-0 transition-transform group-data-open:rotate-180" />
		</div>
	);
};

export type ToolContentProps = ComponentProps<typeof CollapsibleContent>;

export const ToolContent = ({ className, ...props }: ToolContentProps) => (
	<CollapsibleContent
		className={cn(
			"data-closed:fade-out-0 data-closed:slide-out-to-top-2 data-open:slide-in-from-top-2 space-y-4 p-4 text-popover-foreground outline-none data-closed:animate-out data-open:animate-in",
			className,
		)}
		{...props}
	/>
);

export type ToolInputProps = ComponentProps<"div"> & {
	input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
	<div className={cn("space-y-1", className)} {...props}>
		<h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
			Parameters
		</h4>
		<pre className="max-h-48 overflow-auto rounded-sm bg-accent/60 p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap">
			{JSON.stringify(input, null, 2)}
		</pre>
	</div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
	output: ToolPart["output"];
	errorText: ToolPart["errorText"];
};

export const ToolOutput = ({
	className,
	output,
	errorText,
	...props
}: ToolOutputProps) => {
	if (!(output || errorText)) {
		return null;
	}

	const text =
		errorText ??
		(typeof output === "string"
			? output
			: isValidElement(output)
				? null
				: JSON.stringify(output, null, 2));

	return (
		<div className={cn("space-y-1", className)} {...props}>
			<h4 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
				{errorText ? "Error" : "Result"}
			</h4>
			{/*
			 * `text-destructive` is the oxblood FILL and measures 1.81:1 on this
			 * app's charcoal — the ink token is the readable one. See the
			 * destructive block in globals.css.
			 */}
			<pre
				className={cn(
					"max-h-48 overflow-auto rounded-sm p-2 font-mono text-[10px] leading-relaxed whitespace-pre-wrap",
					errorText
						? "bg-destructive-ink/10 text-destructive-ink"
						: "bg-accent/60 text-muted-foreground",
				)}
			>
				{text ?? (output as ReactNode)}
			</pre>
		</div>
	);
};

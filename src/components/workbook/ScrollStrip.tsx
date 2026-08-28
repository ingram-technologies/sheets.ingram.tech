"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A horizontally scrolling strip of chrome that admits it is scrolling.
 *
 * The formatting toolbar and the sheet-tab strip are both a single row that
 * cannot wrap — wrapping would change the chrome's height and push the grid
 * around — so both scroll sideways when they outgrow the viewport. Bare
 * `overflow-x-auto` made that a trap: below roughly 900px the alignment and
 * number-format controls simply were not there, with nothing on screen saying
 * so and no way to reach them with a mouse that has no horizontal wheel.
 *
 * Two affordances, each doing a different job:
 *
 * - A fade at whichever edge has more content behind it. This is the *signal*,
 *   and it is why the native scrollbar is hidden here: in a 36px strip a
 *   classic scrollbar eats a third of the row and still reads as a defect.
 * - A chevron at that same edge. This is the *control*, for the pointer user
 *   the fade alone would strand.
 *
 * The chevrons are `aria-hidden` and out of the tab order on purpose. Every
 * control inside the strip is already a tab stop, and focusing one scrolls it
 * into view, so a keyboard user gains nothing from them and would pay two
 * extra stops in the middle of a formatting row.
 */
export function ScrollStrip({
	className,
	contentClassName,
	ref: forwarded,
	children,
	...props
}: {
	className?: string;
	contentClassName?: string;
	/** Addresses the scrolling element itself, not the wrapper. */
	ref?: React.Ref<HTMLDivElement>;
	children: React.ReactNode;
} & Omit<React.ComponentProps<"div">, "className" | "children" | "ref">) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [edges, setEdges] = useState({ start: false, end: false });

	const attach = useCallback(
		(node: HTMLDivElement | null) => {
			ref.current = node;
			if (typeof forwarded === "function") forwarded(node);
			else if (forwarded) forwarded.current = node;
		},
		[forwarded],
	);

	const measure = useCallback(() => {
		const strip = ref.current;
		if (!strip) return;
		// 1px of slack: fractional layout widths otherwise leave a fade lit
		// over a strip that is already scrolled to its end.
		const max = strip.scrollWidth - strip.clientWidth;
		setEdges({
			start: strip.scrollLeft > 1,
			end: strip.scrollLeft < max - 1,
		});
	}, []);

	useEffect(() => {
		const strip = ref.current;
		if (!strip) return;
		measure();
		// Both are needed: the viewport resizing (the window, or the agent
		// panel being dragged) and the content resizing (a sheet added, a
		// label changing length) each change whether there is overflow.
		const observer = new ResizeObserver(measure);
		observer.observe(strip);
		for (const child of strip.children) observer.observe(child);
		return () => observer.disconnect();
	}, [measure, children]);

	const nudge = (direction: -1 | 1) => {
		const strip = ref.current;
		if (!strip) return;
		// Just under a full page, so the control that was at the edge stays
		// visible and the jump keeps its context.
		strip.scrollBy({ left: direction * strip.clientWidth * 0.8 });
	};

	return (
		// No `flex-1` here: the toolbar is a row in a column-flex shell, where
		// growing would stretch it vertically. Callers say which axis they own.
		<div className={cn("relative flex min-w-0 items-center", className)}>
			<div
				ref={attach}
				onScroll={measure}
				className={cn(
					"scrollbar-none flex min-w-0 flex-1 items-center overflow-x-auto",
					contentClassName,
				)}
				{...props}
			>
				{children}
			</div>
			<StripEdge side="start" shown={edges.start} onNudge={() => nudge(-1)} />
			<StripEdge side="end" shown={edges.end} onNudge={() => nudge(1)} />
		</div>
	);
}

function StripEdge({
	side,
	shown,
	onNudge,
}: {
	side: "start" | "end";
	shown: boolean;
	onNudge: () => void;
}) {
	const start = side === "start";
	return (
		<div
			aria-hidden
			// Kept mounted and faded so the strip's own width never changes
			// when overflow appears — a chevron that reflows the row it is
			// describing would make the last control oscillate in and out.
			className={cn(
				"absolute inset-y-0 z-[var(--z-grid-overlay)] flex items-center transition-opacity duration-150",
				start ? "left-0 pr-6" : "right-0 pl-6",
				shown ? "opacity-100" : "pointer-events-none opacity-0",
			)}
			style={{
				// The fade is the strip's own ground, so the controls slide
				// under the chrome rather than under a grey band.
				backgroundImage: `linear-gradient(to ${start ? "right" : "left"}, var(--background) 55%, transparent)`,
			}}
		>
			<button
				type="button"
				tabIndex={-1}
				onClick={onNudge}
				className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
			>
				{start ? (
					<ChevronLeftIcon className="size-4" />
				) : (
					<ChevronRightIcon className="size-4" />
				)}
			</button>
		</div>
	);
}

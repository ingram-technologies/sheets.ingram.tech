"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The grid's right-click menu.
 *
 * The grid is a canvas, so this can't be the shared registry's dropdown (which
 * needs a DOM trigger to anchor to) — it is positioned from raw pointer
 * coordinates instead. Everything a menu owes the user is therefore hand-built
 * here, and each piece is load-bearing:
 *
 * - It closes on outside pointer-down, Escape, scroll, and resize. The previous
 *   inline menu closed only on the next pointer-down *inside* the grid, so
 *   clicking anywhere else on the page left it stranded over the sheet.
 * - It flips against the container edges instead of rendering off them.
 * - It takes focus, roves with Arrow/Home/End, and returns focus to the grid on
 *   close, so it is reachable without a mouse.
 */

export interface GridMenuItem {
	label: string;
	/**
	 * The keystroke that does the same thing, shown right-aligned.
	 *
	 * This menu is where a spreadsheet teaches its own keyboard: the user who
	 * right-clicks to Copy today is the one who should be pressing the key
	 * tomorrow, and a menu that stays silent about it never gets them there.
	 */
	hint?: string;
	/** Renders a hairline above this item. */
	separated?: boolean;
	destructive?: boolean;
	disabled?: boolean;
	run: () => void;
}

const ITEM_HEIGHT = 30;
const MENU_PADDING = 8;
const MENU_WIDTH = 200;

export function GridMenu({
	x,
	y,
	items,
	onClose,
}: {
	/** Pointer position, relative to the grid container. */
	x: number;
	y: number;
	items: GridMenuItem[];
	onClose: () => void;
}) {
	const ref = useRef<HTMLDivElement | null>(null);
	const [position, setPosition] = useState({ left: x, top: y });

	const enabled = items
		.map((item, index) => ({ item, index }))
		.filter(({ item }) => !item.disabled);

	// Flip before paint: measuring after would show one frame of the menu
	// hanging off the edge.
	useLayoutEffect(() => {
		const element = ref.current;
		const container = element?.offsetParent;
		if (!element || !(container instanceof HTMLElement)) return;
		const width = element.offsetWidth || MENU_WIDTH;
		const height =
			element.offsetHeight || items.length * ITEM_HEIGHT + MENU_PADDING;
		const maxLeft = container.clientWidth - width - 4;
		const maxTop = container.clientHeight - height - 4;
		setPosition({
			// Flip to the other side of the cursor when there's room there,
			// otherwise clamp — a menu taller than the grid still stays inside.
			left: Math.max(4, x > maxLeft ? Math.min(x - width, maxLeft) : x),
			top: Math.max(4, y > maxTop ? Math.min(y - height, maxTop) : y),
		});
	}, [x, y, items.length]);

	useEffect(() => {
		ref.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
	}, []);

	useEffect(() => {
		const onPointerDown = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) onClose();
		};
		// `true`: catch the press before the grid's own handler runs, so
		// clicking a cell to dismiss doesn't also move the selection.
		document.addEventListener("pointerdown", onPointerDown, true);
		window.addEventListener("resize", onClose);
		window.addEventListener("scroll", onClose, true);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown, true);
			window.removeEventListener("resize", onClose);
			window.removeEventListener("scroll", onClose, true);
		};
	}, [onClose]);

	const rove = (event: React.KeyboardEvent, position: number) => {
		const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
		if (!keys.includes(event.key)) return;
		event.preventDefault();
		const last = enabled.length - 1;
		const next =
			event.key === "ArrowDown"
				? position === last
					? 0
					: position + 1
				: event.key === "ArrowUp"
					? position === 0
						? last
						: position - 1
					: event.key === "Home"
						? 0
						: last;
		ref.current
			?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])")
			[next]?.focus();
	};

	return (
		<div
			ref={ref}
			role="menu"
			aria-label="Grid actions"
			className="absolute z-[var(--z-dropdown)] min-w-50 rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
			style={{ left: position.left, top: position.top }}
			onKeyDown={(event) => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				event.stopPropagation();
				onClose();
			}}
		>
			{items.map((item, index) => {
				const enabledIndex = enabled.findIndex(
					(entry) => entry.index === index,
				);
				return (
					<button
						key={item.label}
						type="button"
						role="menuitem"
						disabled={item.disabled}
						tabIndex={-1}
						className={cn(
							"group flex w-full items-center gap-6 rounded-sm px-2 py-1.5 text-left text-sm",
							"disabled:pointer-events-none disabled:opacity-50",
							item.separated && "mt-1 border-t border-border pt-2",
							item.destructive
								? // `text-destructive` is the oxblood FILL at
									// 1.81:1 — the ink token is the readable one.
									"text-destructive-ink hover:bg-destructive hover:text-destructive-foreground"
								: "hover:bg-accent",
						)}
						onKeyDown={(event) => rove(event, enabledIndex)}
						onClick={() => {
							item.run();
							onClose();
						}}
					>
						<span className="flex-1">{item.label}</span>
						{item.hint ? (
							// aria-hidden: the binding is decoration for the
							// reader who can see it, and a screen reader
							// announcing "Copy Ctrl C" as the item's name makes
							// the list harder to scan by ear, not easier.
							<span
								aria-hidden
								className="shrink-0 font-mono text-[11px] text-muted-foreground group-hover:text-inherit"
							>
								{item.hint}
							</span>
						) : null}
					</button>
				);
			})}
		</div>
	);
}

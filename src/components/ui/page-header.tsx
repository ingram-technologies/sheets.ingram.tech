import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The one page-title bar every dashboard page shares: optional leading slot
 * (e.g. a mobile-nav trigger), optional icon chip, title + description, and a
 * trailing actions slot. Keep page-level actions here — not floating in the
 * body — so every screen puts them in the same place.
 */
export function PageHeader({
	title,
	description,
	icon: Icon,
	iconClassName,
	start,
	actions,
	className,
}: {
	title: string;
	description?: string;
	/** Any glyph that colours itself from `currentColor` — Lucide or a brand mark. */
	icon?: React.ComponentType<{ className?: string }>;
	/** Restyle the icon chip, e.g. `bg-primary/10 text-primary` to brand it. */
	iconClassName?: string;
	/** Leading slot before the title, e.g. a mobile-nav trigger. */
	start?: React.ReactNode;
	/** Trailing slot: page-level actions, docs links, filters. */
	actions?: React.ReactNode;
	className?: string;
}) {
	return (
		<header
			data-slot="page-header"
			className={cn(
				"flex h-14 shrink-0 items-center justify-between gap-4 border-b px-4 sm:px-6",
				className,
			)}
		>
			<div className="flex min-w-0 items-center gap-3">
				{start}
				{Icon ? (
					<div
						className={cn(
							"bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md",
							iconClassName,
						)}
					>
						<Icon className="size-4" />
					</div>
				) : null}
				<div className="min-w-0">
					<h1 className="truncate text-sm font-semibold">{title}</h1>
					{description ? (
						<p className="text-muted-foreground truncate text-xs">
							{description}
						</p>
					) : null}
				</div>
			</div>
			{actions ? (
				<div className="flex shrink-0 items-center gap-3">{actions}</div>
			) : null}
		</header>
	);
}

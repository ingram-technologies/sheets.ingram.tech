import type { LucideIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Consistent empty/zero-data placeholder used across list pages so every
 * surface communicates "nothing here yet" the same way. Give it an `action`
 * that teaches the next step (create, import, connect) — an empty state should
 * onboard, not dead-end.
 */
export function EmptyState({
	icon: Icon,
	title,
	description,
	action,
	className,
}: {
	icon: LucideIcon;
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			data-slot="empty-state"
			className={cn(
				"flex flex-col items-center justify-center gap-3 py-20 text-center",
				className,
			)}
		>
			<div className="bg-muted text-muted-foreground flex size-12 items-center justify-center rounded-full">
				<Icon className="size-6" />
			</div>
			<div className="flex flex-col gap-1">
				<p className="text-sm font-medium">{title}</p>
				{description ? (
					<p className="text-muted-foreground mx-auto max-w-sm text-sm">
						{description}
					</p>
				) : null}
			</div>
			{action ? <div className="mt-1">{action}</div> : null}
		</div>
	);
}

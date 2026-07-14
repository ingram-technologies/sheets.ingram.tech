"use client";

import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * App-level toast outlet, themed via the shared token vocabulary so toasts
 * match the surface they float over. Mount once in the root layout; fire
 * notifications with the re-exported `toast()`.
 */
function Toaster({ style, ...props }: ToasterProps) {
	return (
		<Sonner
			className="toaster group"
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					...style,
				} as React.CSSProperties
			}
			{...props}
		/>
	);
}

export { toast } from "sonner";
export { Toaster };

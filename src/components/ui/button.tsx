"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/90",
				destructive:
					"bg-destructive text-destructive-foreground hover:bg-destructive/90",
				outline:
					"border border-input bg-background hover:bg-accent hover:text-accent-foreground",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-secondary/80",
				ghost: "hover:bg-accent hover:text-accent-foreground",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default: "h-10 px-4 py-2",
				sm: "h-9 rounded-md px-3",
				lg: "h-11 rounded-md px-8",
				icon: "h-10 w-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

/**
 * Base UI's button-like components default `nativeButton` to true; when the
 * `render` prop swaps in a non-`<button>` element (e.g. a framework Link) that
 * default is wrong and Base UI warns. Returns true only for a real `<button>`.
 */
function isNativeButtonElement(render: unknown): boolean {
	return React.isValidElement(render) && render.type === "button";
}

export interface ButtonProps
	extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
	/**
	 * Render the button as its single child element (merging button props onto
	 * it), e.g. `<Button asChild><Link href="…">…</Link></Button>`. Kept as the
	 * historic Radix API; internally it maps to Base UI's `render` prop.
	 */
	asChild?: boolean;
}

function Button({
	className,
	variant,
	size,
	asChild = false,
	render,
	children,
	...props
}: ButtonProps) {
	const asChildRender =
		asChild && React.isValidElement(children)
			? (children as React.ReactElement)
			: undefined;
	const resolvedRender = asChildRender ?? render;

	return (
		<ButtonPrimitive
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			render={resolvedRender}
			// Without a render override the primitive renders a real <button>;
			// only a swapped-in non-button element must drop native semantics.
			nativeButton={
				resolvedRender === undefined || isNativeButtonElement(resolvedRender)
			}
			{...props}
		>
			{asChild ? undefined : children}
		</ButtonPrimitive>
	);
}

export { Button, buttonVariants };

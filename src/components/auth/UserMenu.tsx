"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";

export function UserMenu() {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
	const [imageFailed, setImageFailed] = useState(false);

	// Reserve the slot while the session resolves. Returning null shifted the
	// whole header the moment it arrived, because the save-state text next to
	// it is `ml-auto`.
	if (isPending || !session) {
		return <div className="size-7 shrink-0 rounded-full bg-accent" aria-hidden />;
	}

	const { user } = session;
	const initial = (user.name || user.email || "?").charAt(0).toUpperCase();
	// Narrow to a definite string so there is no `?? ""` fallback: an empty
	// src renders as a broken image rather than falling back to the initial.
	const avatar = !imageFailed && user.image ? user.image : null;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Account"
				// focus-visible, not just hover: this is a bare trigger rather
				// than a Button, so it inherited none of button.tsx's focus
				// styles and was an invisible tab stop.
				className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-medium text-primary hover:ring-2 hover:ring-ring/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
			>
				{avatar ? (
					// Plain <img>: Google avatar URLs are tiny and next/image's
					// remote-domain allowlist isn't worth configuring for them.
					// width/height reserve the box (CLS), and no-referrer avoids
					// Google's CDN 403ing on the Referer header.
					<img
						src={avatar}
						alt=""
						width={28}
						height={28}
						referrerPolicy="no-referrer"
						className="size-full object-cover"
						// A dead avatar URL used to leave an empty coral circle;
						// fall back to the initial instead.
						onError={() => setImageFailed(true)}
					/>
				) : (
					initial
				)}
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="min-w-52">
				<div className="px-2 py-1.5 text-sm">
					<p className="truncate font-medium">{user.name}</p>
					<p className="truncate text-xs text-muted-foreground">
						{user.email}
					</p>
				</div>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() =>
						void authClient.signOut({
							fetchOptions: { onSuccess: () => router.push("/login") },
						})
					}
				>
					<LogOut className="size-4" />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

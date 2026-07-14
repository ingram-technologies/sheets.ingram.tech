"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

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
	const { data: session } = authClient.useSession();
	if (!session) return null;
	const { user } = session;
	const initial = (user.name || user.email || "?").charAt(0).toUpperCase();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label="Account"
				className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-xs font-medium text-primary hover:ring-2 hover:ring-ring/30"
			>
				{user.image ? (
					// Plain <img>: Google avatar URLs are tiny and next/image's
					// remote-domain allowlist isn't worth configuring for them.
					<img src={user.image} alt="" className="size-full object-cover" />
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

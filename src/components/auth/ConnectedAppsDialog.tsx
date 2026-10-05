"use client";

import { Loader2Icon, PlugIcon, UnplugIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toaster";

// Validate the API's own response, and stay client-safe: importing the schema
// from lib/connected-apps would pull the Postgres pool into the browser bundle.
const connectedApp = z.object({
	clientId: z.string(),
	name: z.string().nullable(),
	uri: z.string().nullable(),
	connectedAt: z.string(),
	lastActiveAt: z.string().nullable(),
});
const connectedAppsResponse = z.object({ apps: z.array(connectedApp) });

type ConnectedApp = z.infer<typeof connectedApp>;

/**
 * The programs this user has allowed into their workbooks over MCP (Claude
 * Code and the like), each with a way out. Disconnecting removes the app's
 * access at once, including tokens it already holds; connecting it again
 * means signing in and allowing it again.
 */
export function ConnectedAppsDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const [apps, setApps] = useState<ConnectedApp[] | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	const [confirmId, setConfirmId] = useState<string | null>(null);

	// Reset during render off a previous-prop sentinel, as TrashDialog does,
	// so a reopen never paints the last visit's list for a frame.
	const [wasOpen, setWasOpen] = useState(false);
	if (open !== wasOpen) {
		setWasOpen(open);
		if (open) {
			setApps(null);
			setConfirmId(null);
		}
	}

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		void (async () => {
			try {
				const response = await fetch("/api/connected-apps");
				const parsed = connectedAppsResponse.safeParse(await response.json());
				if (!cancelled) setApps(parsed.success ? parsed.data.apps : []);
			} catch {
				if (!cancelled) setApps([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open]);

	const disconnect = async (app: ConnectedApp) => {
		setBusyId(app.clientId);
		try {
			const response = await fetch(
				`/api/connected-apps/${encodeURIComponent(app.clientId)}`,
				{ method: "DELETE" },
			);
			// 404 means it was already gone; either way it is not connected.
			if (!response.ok && response.status !== 404) throw new Error();
			setApps(
				(current) =>
					current?.filter((a) => a.clientId !== app.clientId) ?? null,
			);
			toast.success(`Disconnected ${displayName(app)}`);
		} catch {
			toast.error("Couldn't disconnect the app");
		} finally {
			setBusyId(null);
			setConfirmId(null);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg gap-4">
				<DialogHeader>
					<DialogTitle>Connected apps</DialogTitle>
					<DialogDescription>
						Apps you have allowed to read and edit your workbooks.
						Disconnecting one cuts it off immediately.
					</DialogDescription>
				</DialogHeader>

				{apps === null ? (
					<div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
						<Loader2Icon className="size-4 animate-spin" />
						Loading…
					</div>
				) : apps.length === 0 ? (
					<div className="flex flex-col items-center gap-2 py-10 text-center">
						<PlugIcon className="size-6 text-muted-foreground" />
						<p className="text-sm text-muted-foreground">
							No apps are connected.
						</p>
					</div>
				) : (
					<ul className="-mx-1 max-h-[min(60vh,26rem)] space-y-0.5 overflow-y-auto">
						{apps.map((app) => {
							const confirming = confirmId === app.clientId;
							const busy = busyId === app.clientId;
							return (
								<li
									key={app.clientId}
									className="flex items-center gap-3 rounded-md px-1 py-2"
								>
									<PlugIcon className="size-4 shrink-0 text-muted-foreground" />
									<span className="min-w-0 flex-1">
										<span className="block truncate text-sm font-medium">
											{displayName(app)}
										</span>
										<span className="block truncate text-xs text-muted-foreground">
											{describe(app)}
										</span>
									</span>
									{confirming ? (
										<span className="flex items-center gap-1">
											<Button
												variant="destructive"
												size="sm"
												className="h-7 px-2 text-xs"
												disabled={busy}
												onClick={() => void disconnect(app)}
											>
												{busy ? (
													<Loader2Icon className="size-3.5 animate-spin" />
												) : null}
												Disconnect
											</Button>
											<Button
												variant="ghost"
												size="sm"
												className="h-7 px-2 text-xs"
												disabled={busy}
												onClick={() => setConfirmId(null)}
											>
												Cancel
											</Button>
										</span>
									) : (
										<Button
											variant="outline"
											size="sm"
											className="h-7 px-2 text-xs"
											aria-label={`Disconnect ${displayName(app)}`}
											onClick={() => setConfirmId(app.clientId)}
										>
											<UnplugIcon className="size-3.5" />
											Disconnect
										</Button>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</DialogContent>
		</Dialog>
	);
}

function displayName(app: ConnectedApp): string {
	return app.name ?? "Unnamed app";
}

function describe(app: ConnectedApp): string {
	const connected = `Allowed ${formatWhen(app.connectedAt)}`;
	return app.lastActiveAt
		? `${connected} · last active ${formatWhen(app.lastActiveAt)}`
		: connected;
}

function formatWhen(iso: string): string {
	return new Date(iso).toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

"use client";

import { Loader2Icon } from "lucide-react";
import { useState } from "react";

import { SheetsMark } from "@/components/brand/sheets-mark";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function ConsentForm({
	clientName,
	clientUri,
	email,
	staysConnected,
}: {
	clientName: string;
	clientUri: string | null;
	email: string;
	staysConnected: boolean;
}) {
	const [pending, setPending] = useState<"allow" | "deny" | null>(null);
	const [error, setError] = useState<string | null>(null);

	const answer = async (accept: boolean) => {
		setPending(accept ? "allow" : "deny");
		setError(null);
		// The client plugin attaches the signed query from this page's URL, so
		// the server knows which authorization this answers.
		const { data, error: consentError } = await authClient.oauth2.consent({
			accept,
		});
		if (consentError || !data?.url) {
			setPending(null);
			setError(consentError?.message ?? "That didn't go through. Try again.");
			return;
		}
		// Back to the application, with a code if allowed, an error if not.
		window.location.href = data.url;
	};

	return (
		<ConsentShell>
			<div className="space-y-3 text-center">
				<h1 className="text-xl font-semibold text-balance">
					Allow {clientName} to use your spreadsheets?
				</h1>
				<p className="text-sm text-muted-foreground">
					It will be able to read, create and edit every workbook in your
					account, <span className="text-foreground">{email}</span>
					{staysConnected ? ", and keep it without asking again." : "."}
				</p>
				{clientUri ? (
					<p className="text-xs break-all text-muted-foreground">
						{clientUri}
					</p>
				) : null}
			</div>
			<div className="space-y-3">
				<Button
					className="w-full"
					disabled={pending !== null}
					aria-busy={pending === "allow"}
					onClick={() => void answer(true)}
				>
					{pending === "allow" ? (
						<Loader2Icon className="size-4 animate-spin" />
					) : null}
					Allow
				</Button>
				<Button
					variant="outline"
					className="w-full"
					disabled={pending !== null}
					aria-busy={pending === "deny"}
					onClick={() => void answer(false)}
				>
					{pending === "deny" ? (
						<Loader2Icon className="size-4 animate-spin" />
					) : null}
					Deny
				</Button>
				{error ? (
					<p
						className="text-center text-sm text-destructive-ink"
						role="alert"
					>
						{error}
					</p>
				) : null}
			</div>
		</ConsentShell>
	);
}

/** A consent link that is expired, tampered with, or names no known client. */
export function ConsentProblem() {
	return (
		<ConsentShell>
			<div className="space-y-2 text-center">
				<h1 className="text-xl font-semibold">This request has expired</h1>
				<p className="text-sm text-muted-foreground">
					Go back to the application and connect again.
				</p>
			</div>
		</ConsentShell>
	);
}

function ConsentShell({ children }: { children: React.ReactNode }) {
	return (
		<main className="flex min-h-dvh items-center justify-center px-6">
			<div className="w-full max-w-sm space-y-8">
				<div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10">
					<SheetsMark className="size-5 text-primary" />
				</div>
				{children}
			</div>
		</main>
	);
}

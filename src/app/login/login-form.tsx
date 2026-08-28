"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { SheetsMark } from "@/components/brand/sheets-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

// If the handoff to Google hasn't navigated away by now, something is wrong
// (blocked popup, offline, bfcache restore). Give the button back rather than
// leaving "Redirecting…" disabled forever.
const REDIRECT_TIMEOUT_MS = 8000;

export function LoginForm({
	next,
	enableDevEmailPassword,
}: {
	next: string;
	enableDevEmailPassword: boolean;
}) {
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isCreatingDevAccount, setIsCreatingDevAccount] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		// Returning via the back button restores this page from bfcache with
		// `pending` still true and the button dead. Reset on restore.
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) setPending(false);
		};
		window.addEventListener("pageshow", onPageShow);
		return () => {
			window.removeEventListener("pageshow", onPageShow);
			if (timer.current) clearTimeout(timer.current);
		};
	}, []);

	const signIn = async () => {
		setPending(true);
		setError(null);
		timer.current = setTimeout(() => {
			setPending(false);
			setError("That took too long. Check your connection and try again.");
		}, REDIRECT_TIMEOUT_MS);
		try {
			const { error: signInError } = await authClient.signIn.social({
				provider: "google",
				callbackURL: next,
			});
			if (signInError) throw new Error(signInError.message ?? "Sign-in failed");
			// On success the browser navigates to Google; keep pending until then.
		} catch (caught) {
			if (timer.current) clearTimeout(timer.current);
			setPending(false);
			// Inline, not a toast: this is the one screen where the failure IS
			// the content, and a toast that fades leaves a dead end.
			setError(caught instanceof Error ? caught.message : "Sign-in failed");
		}
	};

	const signInWithEmailPassword = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const email = String(form.get("email") ?? "");
		const password = String(form.get("password") ?? "");
		const name = String(form.get("name") ?? "");

		setPending(true);
		setError(null);
		try {
			const result = isCreatingDevAccount
				? await authClient.signUp.email({ name, email, password })
				: await authClient.signIn.email({ email, password });
			if (result.error) throw new Error(result.error.message ?? "Sign-in failed");
			window.location.assign(next);
		} catch (caught) {
			setPending(false);
			setError(caught instanceof Error ? caught.message : "Sign-in failed");
		}
	};

	return (
		<main className="flex min-h-dvh items-center justify-center px-6">
			<div className="w-full max-w-sm space-y-8">
				<div className="space-y-2 text-center">
					<div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10">
						<SheetsMark className="size-5 text-primary" />
					</div>
					<h1 className="text-xl font-semibold">Ingram Sheets</h1>
					<p className="text-sm text-muted-foreground">
						AI-native spreadsheets
					</p>
				</div>
				<div className="space-y-3">
					<Button
						variant="outline"
						className="w-full"
						disabled={pending}
						aria-busy={pending}
						onClick={() => void signIn()}
					>
						{pending ? (
							<Loader2Icon className="size-4 animate-spin" />
						) : (
							<GoogleIcon />
						)}
						{pending ? "Redirecting…" : "Continue with Google"}
					</Button>
					{enableDevEmailPassword ? (
						<>
							<div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
								Local development
							</div>
							<form
								className="space-y-3"
								onSubmit={signInWithEmailPassword}
							>
								{isCreatingDevAccount ? (
									<Input
										name="name"
										placeholder="Name"
										required
										disabled={pending}
									/>
								) : null}
								<Input
									name="email"
									type="email"
									placeholder="Email"
									autoComplete="email"
									required
									disabled={pending}
								/>
								<Input
									name="password"
									type="password"
									placeholder="Password"
									autoComplete={
										isCreatingDevAccount
											? "new-password"
											: "current-password"
									}
									minLength={8}
									required
									disabled={pending}
								/>
								<Button
									type="submit"
									variant="secondary"
									className="w-full"
									disabled={pending}
									aria-busy={pending}
								>
									{pending ? (
										<Loader2Icon className="size-4 animate-spin" />
									) : null}
									{isCreatingDevAccount
										? "Create local account"
										: "Sign in locally"}
								</Button>
							</form>
							<Button
								variant="link"
								className="w-full text-xs"
								disabled={pending}
								onClick={() => {
									setIsCreatingDevAccount((current) => !current);
									setError(null);
								}}
							>
								{isCreatingDevAccount
									? "Already have a local account? Sign in"
									: "Need a local account? Create one"}
							</Button>
						</>
					) : null}
					{error ? (
						<p
							className="text-center text-sm text-destructive-ink"
							role="alert"
						>
							{error}
						</p>
					) : null}
				</div>
			</div>
		</main>
	);
}

/**
 * Google's four brand hexes are mandated by their branding guidelines and must
 * not be tokenised — this is the one place in the app where a hardcoded colour
 * is correct.
 */
function GoogleIcon() {
	return (
		<svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
			<path
				fill="#4285F4"
				d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
			/>
			<path
				fill="#34A853"
				d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z"
			/>
			<path
				fill="#FBBC05"
				d="M5.27 14.29A7.14 7.14 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a11.99 11.99 0 0 0 0 10.76l3.98-3.09z"
			/>
			<path
				fill="#EA4335"
				d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
			/>
		</svg>
	);
}

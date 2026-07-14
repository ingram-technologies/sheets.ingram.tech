"use client";

import { Grid3x3 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ next }: { next: string }) {
	const [pending, setPending] = useState(false);

	const signIn = async () => {
		setPending(true);
		const { error } = await authClient.signIn.social({
			provider: "google",
			callbackURL: next,
		});
		if (error) {
			toast.error(error.message ?? "Sign-in failed");
			setPending(false);
		}
		// On success the browser navigates to Google; keep the pending state.
	};

	return (
		<main className="flex min-h-dvh items-center justify-center px-6">
			<div className="w-full max-w-sm space-y-8">
				<div className="space-y-2 text-center">
					<div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-primary/10">
						<Grid3x3 className="size-5 text-primary" />
					</div>
					<h1 className="text-lg font-semibold">Sheets</h1>
					<p className="text-sm text-muted-foreground">
						AI-native collaborative spreadsheets
					</p>
				</div>
				<Button
					variant="outline"
					className="w-full"
					disabled={pending}
					onClick={() => void signIn()}
				>
					<GoogleIcon />
					{pending ? "Redirecting…" : "Continue with Google"}
				</Button>
			</div>
		</main>
	);
}

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

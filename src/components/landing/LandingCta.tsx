"use client";

import { ArrowRightIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// Mirror of login-form's guard: if the Google handoff hasn't navigated away by
// now, hand the button back rather than sitting on "Redirecting…" forever.
const REDIRECT_TIMEOUT_MS = 8000;

// Where a fresh sign-in lands: straight into the workbook list, not back here.
const AFTER_AUTH = "/spreadsheets";

/**
 * The landing's call to action. Signed-in visitors get a plain link into their
 * spreadsheets; signed-out visitors get one-click Google sign-in right here, so
 * the hero doesn't bounce them through an interstitial first.
 */
export function LandingCta({
	signedIn,
	size = "default",
	className,
	children,
	enableDevEmailPassword,
}: {
	signedIn: boolean;
	enableDevEmailPassword: boolean;
	size?: "default" | "sm" | "lg";
	className?: string;
	children?: React.ReactNode;
}) {
	const [pending, setPending] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const onPageShow = (event: PageTransitionEvent) => {
			if (event.persisted) setPending(false);
		};
		window.addEventListener("pageshow", onPageShow);
		return () => {
			window.removeEventListener("pageshow", onPageShow);
			if (timer.current) clearTimeout(timer.current);
		};
	}, []);

	if (signedIn) {
		return (
			<Button
				size={size}
				className={cn("group", className)}
				render={<Link href={AFTER_AUTH} />}
			>
				{children ?? "Open your spreadsheets"}
				<ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
			</Button>
		);
	}

	if (enableDevEmailPassword) {
		return (
			<Button
				size={size}
				className={cn("group", className)}
				render={<Link href={`/login?next=${AFTER_AUTH}`} />}
			>
				{children ?? "Sign in"}
				<ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
			</Button>
		);
	}

	const signIn = async () => {
		setPending(true);
		timer.current = setTimeout(() => setPending(false), REDIRECT_TIMEOUT_MS);
		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: AFTER_AUTH,
			});
			// Success navigates to Google; keep pending until the page unloads.
		} catch {
			if (timer.current) clearTimeout(timer.current);
			setPending(false);
		}
	};

	return (
		<Button
			size={size}
			className={cn("group", className)}
			disabled={pending}
			aria-busy={pending}
			onClick={() => void signIn()}
		>
			{pending ? <Loader2Icon className="size-4 animate-spin" /> : <GoogleIcon />}
			{pending ? "Redirecting…" : (children ?? "Continue with Google")}
		</Button>
	);
}

/**
 * Google's four brand hexes are mandated by their branding guidelines and must
 * not be tokenised — same exception the login form carries.
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

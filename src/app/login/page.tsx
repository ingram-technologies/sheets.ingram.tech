import { safeNext } from "@ingram-tech/nk-auth/server";

import { redirectIfAuthenticated } from "@/lib/session";
import { isDevEmailPasswordSignInEnabled } from "@/lib/dev-auth";

import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	const next = safeNext((await searchParams).next) ?? "/spreadsheets";
	await redirectIfAuthenticated(next);
	return (
		<LoginForm
			next={next}
			enableDevEmailPassword={isDevEmailPasswordSignInEnabled}
		/>
	);
}

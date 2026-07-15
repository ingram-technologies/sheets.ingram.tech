import { createAuthHelpers } from "@ingram-tech/nk-auth/server";

import { auth } from "@/lib/auth";

export const { getSession, getUser, requireUser, redirectIfAuthenticated } =
	createAuthHelpers(auth);

/**
 * Session gate for API routes. Returns either a 401 Response to hand straight
 * back, or the owning user id every workbook query needs.
 *
 * This deliberately yields the *user* rather than a boolean: workbooks are
 * per-owner, and a gate that only answers "is someone signed in" is what let
 * every signed-in user read and delete every workbook. Callers must pass the
 * returned `userId` into lib/workbooks — those functions take it as a required
 * argument, so an unscoped query won't type-check.
 *
 * Usage:
 *   const gate = await requireApiUser();
 *   if ("response" in gate) return gate.response;
 *   … gate.userId …
 */
export async function requireApiUser(): Promise<
	{ response: Response } | { userId: string }
> {
	const session = await getSession();
	if (!session?.user?.id) {
		return { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
	}
	return { userId: session.user.id };
}

import { createAuthHelpers } from "@ingram-tech/nk-auth/server";

import { auth } from "@/lib/auth";

export const { getSession, getUser, requireUser, redirectIfAuthenticated } =
	createAuthHelpers(auth);

/**
 * Validated session gate for API routes: returns a 401 Response when there is
 * no session, null when the request may proceed. The workspace is still
 * shared (no per-user ownership), so routes only need "is signed in".
 */
export async function requireApiSession(): Promise<Response | null> {
	const session = await getSession();
	if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
	return null;
}

import { createAuthMiddleware } from "@ingram-tech/nk-auth/middleware";

// Optimistic cookie-presence gate (pages only — API routes return validated
// 401s via requireApiUser instead of redirects). "/" can't be listed here:
// nk-auth's loop guard rejects any protectedPath the sign-in path starts
// with, so the homepage relies on its validated requireUser() gate instead.
// `proxy` is Next 16's name for middleware. It also renews the session, which
// the server helpers read without refreshing; the loader builds the auth
// instance only when a session is due for renewal.
export const proxy = createAuthMiddleware({
	protectedPaths: ["/w", "/spreadsheets", "/consent"],
	signInPath: "/login",
	auth: () => import("@/lib/auth").then((m) => m.auth),
});

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|ironcalc/|.*\\.svg).*)"],
};

import { createAuthMiddleware } from "@ingram-tech/nk-auth/middleware";

// Optimistic cookie-presence gate (pages only — API routes return validated
// 401s via requireApiSession instead of redirects). "/" matches exactly;
// "/w" covers every workbook page. `proxy` is Next 16's name for middleware.
export const proxy = createAuthMiddleware({
	protectedPaths: ["/", "/w"],
	signInPath: "/login",
});

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|ironcalc/|.*\\.svg).*)"],
};

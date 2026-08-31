/**
 * GET /internal/connect/ingram-cloud/start?return=/w/wb_… — begin linking the
 * signed-in user's Ingram Cloud organization (an IC app grant,
 * cloud.ingram.tech #261).
 *
 * Session-gated: the user id, a fresh PKCE verifier, a nonce and the
 * same-origin path to return to go into a signed, short-lived cookie; the
 * nonce is the OAuth `state`. Then the browser goes to IC's authorize
 * endpoint, whose console handles sign-in/sign-up, org choice and consent,
 * and sends it back to `../callback`. See docs/architecture.md.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
	authorizeUrl,
	FLIGHT_COOKIE,
	FLIGHT_COOKIE_PATH,
	icOauthConfig,
	safeReturnPath,
	startFlight,
} from "@/lib/ic-oauth";
import { getSession } from "@/lib/session";

export async function GET(request: Request): Promise<Response> {
	const cfg = icOauthConfig();
	if (!cfg) {
		return new Response("Ingram Cloud linking is not configured.", { status: 501 });
	}
	const returnTo = safeReturnPath(new URL(request.url).searchParams.get("return"));
	const session = await getSession();
	if (!session?.user?.id) {
		redirect(`/login?next=${encodeURIComponent(returnTo)}`);
	}
	const { flight, cookie } = startFlight(cfg, session.user.id, returnTo);
	const jar = await cookies();
	jar.set(FLIGHT_COOKIE, cookie, {
		httpOnly: true,
		sameSite: "lax",
		secure: cfg.redirectUri.startsWith("https://"),
		path: FLIGHT_COOKIE_PATH,
		maxAge: 15 * 60,
	});
	redirect(authorizeUrl(cfg, flight));
}

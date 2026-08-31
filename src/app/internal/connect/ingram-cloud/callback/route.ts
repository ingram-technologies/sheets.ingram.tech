/**
 * GET /internal/connect/ingram-cloud/callback — finish an Ingram Cloud link.
 *
 * The redirect URI registered in the app's client metadata document. IC sends
 * the browser here with `?code&state&iss` (or `?error`). We match `state` to
 * the in-flight cookie `start` set, check `iss` (RFC 9207), redeem the code
 * with our `private_key_jwt` assertion, and store the resulting project token
 * exactly as a pasted key is stored — verified, agent provisioned, encrypted.
 * Then back to where the user started, with a one-word status in the query
 * (`?ic=linked|denied|error`) the setup dialog turns into a toast.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
	DEFAULT_RETURN_PATH,
	exchangeCode,
	FLIGHT_COOKIE,
	FLIGHT_COOKIE_PATH,
	icOauthConfig,
	IcOauthError,
	readFlight,
} from "@/lib/ic-oauth";
import { describeIcError, saveInferenceCredential } from "@/lib/inference";
import { getSession } from "@/lib/session";

const querySchema = z.object({
	code: z.string().min(1).optional(),
	state: z.string().min(1).optional(),
	iss: z.string().optional(),
	error: z.string().optional(),
	error_description: z.string().optional(),
});

function back(returnTo: string, status: string, detail?: string): never {
	const u = new URL(returnTo, "https://sheets.invalid");
	u.searchParams.set("ic", status);
	if (detail) u.searchParams.set("detail", detail.slice(0, 160));
	redirect(`${u.pathname}${u.search}`);
}

export async function GET(req: Request): Promise<Response> {
	const cfg = icOauthConfig();
	if (!cfg) {
		return new Response("Ingram Cloud linking is not configured.", { status: 501 });
	}
	const jar = await cookies();
	const flight = readFlight(cfg, jar.get(FLIGHT_COOKIE)?.value ?? "");
	jar.delete({ name: FLIGHT_COOKIE, path: FLIGHT_COOKIE_PATH });
	const returnTo = flight?.returnTo ?? DEFAULT_RETURN_PATH;

	const u = new URL(req.url);
	const parsed = querySchema.safeParse(Object.fromEntries(u.searchParams));
	if (!parsed.success) back(returnTo, "error", "Malformed callback.");
	const q = parsed.data;

	if (q.error) {
		back(
			returnTo,
			q.error === "access_denied" ? "denied" : "error",
			q.error_description ?? q.error,
		);
	}
	if (!flight || !q.code || !q.state || q.state !== flight.nonce) {
		back(
			returnTo,
			"error",
			"This link has expired or was started elsewhere. Try again.",
		);
	}
	if (q.iss && q.iss !== cfg.apiBase) {
		back(returnTo, "error", "The reply did not come from Ingram Cloud.");
	}

	// The person completing must still be the signed-in user who started the
	// link; the cookie binds the user, the session binds the browser.
	const session = await getSession();
	if (session?.user?.id !== flight.userId) {
		back(
			returnTo,
			"error",
			"Sign in with the account that started the link, then retry.",
		);
	}

	let token: string;
	try {
		({ token } = await exchangeCode(cfg, flight, q.code));
	} catch (e) {
		back(
			returnTo,
			"error",
			e instanceof IcOauthError ? e.message : "Token exchange failed.",
		);
	}

	try {
		await saveInferenceCredential({
			userId: flight.userId,
			token,
			baseUrl:
				cfg.apiBase === "https://api.cloud.ingram.tech" ? null : cfg.apiBase,
			source: "oauth",
		});
	} catch (e) {
		back(
			returnTo,
			"error",
			`Linked, but setting up the agent failed: ${describeIcError(e)}`,
		);
	}

	back(returnTo, "linked");
}

/**
 * GET /oauth/jwks.json — the public key behind Ingram Sheets' `private_key_jwt`
 * client assertions (`src/lib/ic-oauth.ts`). Ingram Cloud's token endpoint
 * fetches it to verify a code exchange really came from this app.
 */

import { icOauthConfig, jwksDocument } from "@/lib/ic-oauth";

export async function GET(): Promise<Response> {
	const cfg = icOauthConfig();
	if (!cfg) return new Response("Not configured.", { status: 404 });
	return Response.json(await jwksDocument(cfg), {
		headers: { "cache-control": "public, max-age=3600" },
	});
}

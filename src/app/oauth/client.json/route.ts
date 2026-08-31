/**
 * GET /oauth/client.json — Ingram Sheets' OAuth Client ID Metadata Document.
 *
 * This URL IS the app's `client_id` at Ingram Cloud's authorization server
 * (`src/lib/ic-oauth.ts`): IC fetches it to learn our redirect URI and that
 * we authenticate with `private_key_jwt` against `/oauth/jwks.json`. Public,
 * cacheable. 404 when linking isn't configured, so IC reports "no
 * registration" instead of a half-document.
 */

import { clientMetadataDocument, icOauthConfig } from "@/lib/ic-oauth";

export function GET(): Response {
	const cfg = icOauthConfig();
	if (!cfg) return new Response("Not configured.", { status: 404 });
	return Response.json(clientMetadataDocument(cfg), {
		headers: { "cache-control": "public, max-age=3600" },
	});
}

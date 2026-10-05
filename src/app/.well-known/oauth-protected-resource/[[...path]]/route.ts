import { auth } from "@/lib/auth";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) — points a client from
 * this resource server at the authorization server that guards it.
 *
 * The optional catch-all is not decoration. RFC 9728 locates the document by
 * *inserting* the well-known segment before the resource's own path, so the
 * URL for `https://sheets.ingram.tech/api/mcp` is
 * `/.well-known/oauth-protected-resource/api/mcp`, while older clients fetch
 * the bare `/.well-known/oauth-protected-resource`. The `mcp` plugin answers
 * both forms when the request reaches Better Auth's handler.
 */
export const GET = (request: Request) => auth.handler(request);

import { oAuthProtectedResourceMetadata } from "better-auth/plugins";

import { auth } from "@/lib/auth";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) — points a client from
 * this resource server at the authorization server that guards it.
 *
 * The optional catch-all is not decoration. RFC 9728 locates the document by
 * *inserting* the well-known segment before the resource's own path, so the
 * URL for `https://sheets.ingram.tech/api/mcp` is
 * `/.well-known/oauth-protected-resource/api/mcp`, while older clients fetch
 * the bare `/.well-known/oauth-protected-resource`. Both forms land here and
 * get the same document, so discovery works whichever revision the client
 * implements.
 */
export const GET = oAuthProtectedResourceMetadata(auth);

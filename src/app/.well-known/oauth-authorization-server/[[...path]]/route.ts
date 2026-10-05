import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/lib/auth";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414), at the origin root.
 *
 * Better Auth mounts at `/auth` (see the nextkit route conventions), so the
 * issuer is `…/auth`, and RFC 8414 locates an issuer-with-a-path's document
 * by *inserting* the well-known segment before that path:
 * `/.well-known/oauth-authorization-server/auth`. Nothing under `/auth` can
 * answer there, hence this route. The optional catch-all also answers the
 * bare form, which clients that ignore the issuer's path still ask for.
 *
 * This is what makes `claude mcp add` a browser sign-in rather than a
 * credential to paste: the client reads this, registers itself, and runs the
 * authorization code flow.
 */
export const GET = oauthProviderAuthServerMetadata(auth);

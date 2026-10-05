import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";

import { auth } from "@/lib/auth";

/**
 * OpenID Connect discovery for the same issuer, at the origin root. MCP
 * clients fall back to it when the RFC 8414 document is missing, and some
 * try it first; see the oauth-authorization-server route for why the path
 * form, `/.well-known/openid-configuration/auth`, has to live out here.
 */
export const GET = oauthProviderOpenIdConfigMetadata(auth);

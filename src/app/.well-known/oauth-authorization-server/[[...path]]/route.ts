import { mcpDiscovery } from "@ingram-tech/nk-auth/mcp";

import { auth } from "@/lib/auth";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414). The issuer is `…/auth`,
 * so the document lives at `/.well-known/oauth-authorization-server/auth`,
 * which nothing under `/auth` can answer. This is what turns `claude mcp add`
 * into a browser sign-in: the client reads it, registers, and runs the code flow.
 */
export const GET = mcpDiscovery(auth).authorizationServer;

import { mcpDiscovery } from "@ingram-tech/nk-auth/mcp";

import { auth } from "@/lib/auth";

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for /api/mcp. The optional
 * catch-all answers both `/.well-known/oauth-protected-resource/api/mcp`, where
 * RFC 9728 puts it, and the bare form older clients fetch.
 */
export const GET = mcpDiscovery(auth).protectedResource;

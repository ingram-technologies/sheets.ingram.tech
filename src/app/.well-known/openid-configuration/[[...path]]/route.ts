import { mcpDiscovery } from "@ingram-tech/nk-auth/mcp";

import { auth } from "@/lib/auth";

/** OpenID Connect discovery for the same issuer; MCP clients fall back to it. */
export const GET = mcpDiscovery(auth).openIdConfiguration;

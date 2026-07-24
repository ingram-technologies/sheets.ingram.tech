import { oAuthDiscoveryMetadata } from "better-auth/plugins";

import { auth } from "@/lib/auth";

/**
 * OAuth 2.0 Authorization Server Metadata (RFC 8414).
 *
 * Must sit at the *origin root*: a client that has only seen
 * `https://sheets.ingram.tech/api/mcp` discovers how to authenticate by
 * fetching this well-known path, and it will not find it under our
 * `/auth` base path (see the nextkit route conventions — Better Auth mounts
 * at `/auth`, not the framework default). So this route re-exposes Better
 * Auth's own metadata endpoint where the spec says to look.
 *
 * This is what makes `claude mcp add` a browser sign-in rather than a
 * credential to paste: the client reads this, registers itself dynamically,
 * and runs the authorization code flow.
 */
export const GET = oAuthDiscoveryMetadata(auth);

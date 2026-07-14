// Mounted at /auth (via `basePath: authBasePath`), NOT /api/auth: auth is a
// user-facing surface (sign-in, OAuth callbacks), not an internal machine API.
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";

export const { GET, POST } = toNextJsHandler(auth);

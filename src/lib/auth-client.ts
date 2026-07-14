"use client";

import { authBasePath, createAuthClient } from "@ingram-tech/nk-auth/client";

// Same-origin: an empty baseURL resolves against window.location.
export const authClient = createAuthClient({ basePath: authBasePath });

"use client";

import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { authBasePath, createAuthClient } from "@ingram-tech/nk-auth/client";

// Same-origin: an empty baseURL resolves against window.location.
//
// `oauthProviderClient` carries the signed OAuth query from the page's URL
// into sign-in and consent calls, which is how /login and /consent resume an
// MCP client's authorization instead of dropping the user on the file list.
export const authClient = createAuthClient({
	basePath: authBasePath,
	plugins: [oauthProviderClient()],
});

import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Plain node-environment config (same shape as depot's): teach Vitest the
 * `@/…` path alias. nk-dev's shared vitest preset is skipped for now — its
 * `.ts` entry can't be loaded from node_modules under Node's type stripping.
 */
export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
});

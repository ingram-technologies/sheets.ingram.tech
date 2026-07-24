import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Plain node-environment config (same shape as depot's): teach Vitest the
 * `@/…` path alias. nk-dev's shared vitest preset is skipped for now — its
 * `.ts` entry can't be loaded from node_modules under Node's type stripping.
 */
export default defineConfig({
	test: {
		// The PGlite test harness serves one socket connection at a time, so
		// two test files sharing it deadlock. Serial files is the harness's
		// documented requirement, not a workaround for a flaky test.
		fileParallelism: false,
		// Booting PGlite and instantiating the engine wasm costs a few seconds
		// on a cold run, which the 5s default clips.
		testTimeout: 30_000,
	},
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
});

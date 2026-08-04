import type { NextConfig } from "next";

const config: NextConfig = {
	// sheetkit-wasm is loaded at runtime by src/lib/sheetkit-server.ts, which
	// resolves the .wasm out of the package and reads it off disk. Keeping the
	// package external leaves require.resolve pointing at a real node_modules
	// path instead of a bundled chunk.
	serverExternalPackages: ["pg", "@electric-sql/pglite", "sheetkit-wasm"],
	// The binary itself is opened via a path built at runtime, which the
	// tracer cannot follow statically — without this the MCP route deploys
	// without its engine and 500s on the first tool call.
	outputFileTracingIncludes: {
		"/api/mcp": ["./vendor/sheetkit-wasm/**/*"],
	},
};

export default config;

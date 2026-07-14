import type { NextConfig } from "next";

const config: NextConfig = {
	// nk-dev owns the TypeScript toolchain and aliases the `typescript` package to
	// the TS6 compat shim, which Next's build-time type-checker can't consume.
	// Type-checking is enforced separately by `nk check` / `nk type-check`.
	typescript: { ignoreBuildErrors: true },
	serverExternalPackages: ["pg", "@electric-sql/pglite"],
};

export default config;

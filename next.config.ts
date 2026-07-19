import type { NextConfig } from "next";

const config: NextConfig = {
	// Next spawns the real `tsc` (TS7 native compiler) for build-time type
	// checking instead of the JS compiler API that TS7 no longer ships.
	experimental: { useTypeScriptCli: true },
	serverExternalPackages: ["pg", "@electric-sql/pglite"],
};

export default config;

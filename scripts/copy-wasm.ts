/**
 * Copy the IronCalc wasm binary into public/ so the browser can fetch it at a
 * stable URL. Runs before dev/build (see package.json); public/ironcalc/ is
 * gitignored — the binary is version-locked to the installed @ironcalc/wasm.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const wasmJs = require.resolve("@ironcalc/wasm");
const source = join(dirname(wasmJs), "wasm_bg.wasm");
const targetDir = join(process.cwd(), "public", "ironcalc");

mkdirSync(targetDir, { recursive: true });
copyFileSync(source, join(targetDir, "wasm_bg.wasm"));
console.log("copy-wasm: public/ironcalc/wasm_bg.wasm");

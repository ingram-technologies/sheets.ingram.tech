/**
 * Copy the wasm binaries into public/ so the browser can fetch them at stable
 * URLs. Runs before dev/build (see package.json); the target dirs are
 * gitignored — binaries are version-locked to the vendored packages.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

function copy(pkg: string, file: string, dir: string) {
	const pkgJs = require.resolve(pkg);
	const targetDir = join(process.cwd(), "public", dir);
	mkdirSync(targetDir, { recursive: true });
	copyFileSync(join(dirname(pkgJs), file), join(targetDir, file));
	console.log(`copy-wasm: public/${dir}/${file}`);
}

copy("@ironcalc/wasm", "wasm_bg.wasm", "ironcalc");
copy("sheetkit-wasm", "sheetkit_wasm_bg.wasm", "sheetkit");

/**
 * sheetkit wasm loader — the Rust tool-surface library (sketch, views, command
 * language) compiled for the browser. Vendored at vendor/sheetkit-wasm from
 * the sheetkit repo's `crates/sheetkit-wasm`, built against the SAME pinned
 * IronCalc rev as @ironcalc/wasm, so engine bytes pass between the two
 * modules without translation. The .wasm binary is copied to public/sheetkit/
 * by scripts/copy-wasm.ts. Client-side only.
 */
import init from "sheetkit-wasm";

let ready: Promise<void> | null = null;

export function ensureSheetkit(): Promise<void> {
	ready ??= init({ module_or_path: "/sheetkit/sheetkit_wasm_bg.wasm" }).then(
		() => undefined,
	);
	return ready;
}

export { WasmSession } from "sheetkit-wasm";

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import init, { WasmSession } from "sheetkit-wasm";

/**
 * sheetkit's tool surface (sketch, views, the command language, the delta
 * echo) running in the *server* runtime, over the same engine bytes the
 * browser produces.
 *
 * This is the one place the server has spreadsheet logic. It exists so an MCP
 * client — Claude Code — can drive a stored workbook without a browser tab
 * open. `docs/architecture.md` explains why that reverses the original "the
 * server never parses spreadsheet content" rule, and how far the reversal
 * goes: the browser is still the interactive source of truth, and this module
 * only ever reads and rewrites the opaque `workbook.bytes` blob.
 *
 * sheetkit-wasm is built against the SAME pinned IronCalc rev as
 * `@ironcalc/wasm` (see docs/engine-constraints.md), so bytes written here
 * load in the browser and vice versa with no translation. Bumping one without
 * the other is a protocol break.
 *
 * Node-only — importing this from a client component pulls `node:fs` into the
 * browser bundle and fails the build.
 */

const require = createRequire(import.meta.url);

let ready: Promise<void> | null = null;

/**
 * Instantiate the wasm module once per server process.
 *
 * The generated glue calls `fetch()` when handed a string/URL, which is wrong
 * here in every way that matters (no origin to resolve against, a network hop
 * for a local file). Passing the bytes directly takes the `BufferSource` path
 * instead. The binary is resolved out of the package rather than `public/`,
 * because `public/` is served statically and is not guaranteed to exist on the
 * server's filesystem at runtime.
 */
function ensureSheetkit(): Promise<void> {
	ready ??= (async () => {
		const pkgJs = require.resolve("sheetkit-wasm");
		const wasm = await readFile(join(dirname(pkgJs), "sheetkit_wasm_bg.wasm"));
		await init({ module_or_path: wasm });
	})();
	return ready;
}

/**
 * Open a workbook from engine bytes, run `fn` against it, and always free the
 * wasm allocation afterwards.
 *
 * The callback shape is not decoration: `WasmSession` owns memory on the wasm
 * heap that the JS GC knows nothing about, so a handler that returns early or
 * throws would leak it for the life of the process. Callers get a session that
 * cannot outlive the call.
 */
export async function withSession<T>(
	bytes: Uint8Array,
	fn: (session: WasmSession) => T,
): Promise<T> {
	await ensureSheetkit();
	const session = WasmSession.fromBytes(bytes);
	try {
		return fn(session);
	} finally {
		session.free();
	}
}

/** Same contract as {@link withSession}, for a workbook built from CSV text. */
export async function withCsvSession<T>(
	csv: string,
	name: string,
	fn: (session: WasmSession) => T,
): Promise<T> {
	await ensureSheetkit();
	const session = WasmSession.fromCsv(csv, name);
	try {
		return fn(session);
	} finally {
		session.free();
	}
}

/** Same contract as {@link withSession}, for a fresh empty workbook. */
export async function withNewSession<T>(
	name: string,
	fn: (session: WasmSession) => T,
): Promise<T> {
	await ensureSheetkit();
	const session = new WasmSession(name);
	try {
		return fn(session);
	} finally {
		session.free();
	}
}

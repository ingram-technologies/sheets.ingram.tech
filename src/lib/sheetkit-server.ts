import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

const WASM_FILE = "sheetkit_wasm_bg.wasm";

/**
 * Where the engine binary might sit, in preference order.
 *
 * Resolved from the working directory rather than with `require.resolve`,
 * which looks like the obvious answer and is not: this module gets bundled,
 * and under Turbopack `createRequire(import.meta.url).resolve()` hands back a
 * virtual `[project]/node_modules/…` path that no filesystem call can open.
 *
 * `vendor/` comes first because it is the real location — `node_modules/
 * sheetkit-wasm` is a symlink to it (a `file:` dependency) — and it is what
 * `outputFileTracingIncludes` in next.config.ts ships. The node_modules path
 * is the fallback for layouts where the package was copied rather than linked.
 */
function wasmCandidates(): string[] {
	return [
		join(process.cwd(), "vendor", "sheetkit-wasm", WASM_FILE),
		join(process.cwd(), "node_modules", "sheetkit-wasm", WASM_FILE),
	];
}

let ready: Promise<void> | null = null;

/**
 * Instantiate the wasm module once per server process.
 *
 * The generated glue calls `fetch()` when handed a string or URL, which is
 * wrong here in every way that matters — no origin to resolve against, a
 * network round trip for a local file. Passing the bytes takes the
 * `BufferSource` path instead.
 */
function ensureSheetkit(): Promise<void> {
	ready ??= (async () => {
		const candidates = wasmCandidates();
		for (const path of candidates) {
			try {
				await init({ module_or_path: await readFile(path) });
				return;
			} catch (error) {
				// Only a missing file is worth trying the next candidate for;
				// a corrupt or incompatible binary is a real failure and must
				// not be masked by falling through to a confusing "not found".
				if (!isNotFound(error)) throw error;
			}
		}
		throw new Error(
			`sheetkit-wasm: ${WASM_FILE} not found. Looked in:\n  ${candidates.join("\n  ")}`,
		);
	})();
	// A failed init must not be cached as a permanent failure: the next call
	// should be allowed to retry rather than inherit a rejected promise.
	ready.catch(() => {
		ready = null;
	});
	return ready;
}

function isNotFound(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
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

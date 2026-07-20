/* tslint:disable */
/* eslint-disable */

export class WasmSession {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Run a command script (`set`, `fill`, `sort`, `expect`, …); returns the
     * rendered outcome including the recalc delta echo.
     */
    exec(script: string, author: string): string;
    /**
     * Open from IronCalc engine bytes (the persistence format).
     */
    static fromBytes(bytes: Uint8Array): WasmSession;
    /**
     * Open from CSV text.
     */
    static fromCsv(csv: string, name: string): WasmSession;
    /**
     * Fresh empty workbook.
     */
    constructor(name: string);
    /**
     * The structure-aware workbook sketch (regions, headers, column types).
     */
    sketch(): string;
    /**
     * Serialize to engine bytes for the host to persist.
     */
    toBytes(): Uint8Array;
    /**
     * Export the current sheet as CSV.
     */
    toCsv(): string;
    /**
     * Render a range/table view under a token budget. `mode` is "dense",
     * "sparse", "agg", or empty for auto.
     */
    view(target: string, mode: string, budget_tokens: number): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmsession_free: (a: number, b: number) => void;
    readonly wasmsession_exec: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmsession_fromBytes: (a: number, b: number) => [number, number, number];
    readonly wasmsession_fromCsv: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly wasmsession_new: (a: number, b: number) => [number, number, number];
    readonly wasmsession_sketch: (a: number) => [number, number];
    readonly wasmsession_toBytes: (a: number) => [number, number];
    readonly wasmsession_toCsv: (a: number) => [number, number, number, number];
    readonly wasmsession_view: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;

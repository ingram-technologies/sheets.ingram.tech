/**
 * IronCalc wasm loader. The .wasm binary is copied to public/ironcalc/ by
 * scripts/copy-wasm.ts and fetched once per page; the JS glue is bundled.
 * Client-side only.
 */
import init from "@ironcalc/wasm";

let ready: Promise<void> | null = null;

export function ensureIronCalc(): Promise<void> {
	ready ??= init({ module_or_path: "/ironcalc/wasm_bg.wasm" }).then(() => undefined);
	return ready;
}

export { columnNameFromNumber, Model } from "@ironcalc/wasm";
export type {
	Area,
	CellStyle,
	Color,
	SelectedView,
	WorksheetProperties,
} from "@ironcalc/wasm";

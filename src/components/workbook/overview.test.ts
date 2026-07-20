import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { initSync as initIroncalc, Model } from "@ironcalc/wasm";
import { initSync as initSheetkit, WasmSession } from "sheetkit-wasm";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The overview path hands `Model.toBytes()` from @ironcalc/wasm to
 * sheetkit-wasm's `WasmSession.fromBytes` — two separate wasm modules built
 * from the SAME pinned engine rev. This is the compatibility contract the
 * whole integration stands on; if the pins ever drift apart, fail here.
 */

const require = createRequire(import.meta.url);

function wasmBytes(pkg: string, file: string): Buffer {
	return readFileSync(join(dirname(require.resolve(pkg)), file));
}

beforeAll(() => {
	initIroncalc({ module: wasmBytes("@ironcalc/wasm", "wasm_bg.wasm") });
	initSheetkit({ module: wasmBytes("sheetkit-wasm", "sheetkit_wasm_bg.wasm") });
});

describe("engine bytes cross the module boundary", () => {
	it("sheetkit sketches a workbook built by @ironcalc/wasm", () => {
		const model = new Model("compat", "en", "UTC", "en");
		const rows: Array<[string, string, string]> = [
			["Plan", "Seats", "MRR"],
			["Free", "1500", "=B2*0"],
			["Pro", "320", "=B3*29"],
			["Scale", "64", "=B4*99"],
		];
		rows.forEach((row, r) => {
			row.forEach((value, c) => model.setUserInput(0, r + 1, c + 1, value));
		});

		const session = WasmSession.fromBytes(model.toBytes());
		try {
			const sketch = session.sketch();
			expect(sketch).toContain("Sheet1");
			expect(sketch).toContain("A1:C4");
			expect(sketch).toContain('"Plan"');
			// Column typing survived: Seats is numeric with its range.
			expect(sketch).toMatch(/Seats.*number/);

			const view = session.view("A1:C4", "dense", 500);
			expect(view).toContain("=B3*29 ⇒ 9280");
		} finally {
			session.free();
			model.free();
		}
	});

	it("round-trips edits made on the sheetkit side back into the app engine", () => {
		const session = WasmSession.fromCsv("a,b\n1,2", "roundtrip");
		try {
			expect(session.exec("set C1 =A2+B2", "test")).toContain("C1 ⇒ 3");
			const model = Model.from_bytes(session.toBytes(), "en");
			try {
				expect(model.getFormattedCellValue(0, 1, 3)).toBe("3");
			} finally {
				model.free();
			}
		} finally {
			session.free();
		}
	});
});

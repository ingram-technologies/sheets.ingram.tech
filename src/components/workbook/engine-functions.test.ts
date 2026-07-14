import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { initSync, Model } from "@ironcalc/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { WorkbookController } from "./controller";

/**
 * Pins the reason the vendored engine build exists: the npm release lags
 * upstream by the dynamic-array era (SUMPRODUCT, FILTER, UNIQUE, LET, …).
 * If a future engine bump regresses these, fail here — not in a user's
 * formula bar.
 */

beforeAll(() => {
	const require = createRequire(import.meta.url);
	const wasmJs = require.resolve("@ironcalc/wasm");
	initSync({ module: readFileSync(join(dirname(wasmJs), "wasm_bg.wasm")) });
});

function seeded(): Model {
	const model = new Model("test", "en", "UTC", "en");
	const rows: Array<[string, string]> = [
		["Fruit", "Qty"],
		["apple", "4"],
		["pear", "7"],
		["apple", "2"],
		["plum", "5"],
	];
	rows.forEach(([fruit, qty], i) => {
		model.setUserInput(0, i + 1, 1, fruit);
		model.setUserInput(0, i + 1, 2, qty);
	});
	return model;
}

describe("modern engine functions", () => {
	it("evaluates functions the old npm release lacked", () => {
		const model = seeded();
		model.setUserInput(0, 1, 4, '=SUMPRODUCT((A2:A5="apple")*B2:B5)');
		model.setUserInput(0, 2, 4, "=LET(x, SUM(B2:B5), x * 2)");
		expect(model.getFormattedCellValue(0, 1, 4)).toBe("6");
		expect(model.getFormattedCellValue(0, 2, 4)).toBe("36");
	});

	it("spills dynamic arrays; the anchor keeps the formula, spill cells don't", () => {
		const model = seeded();
		model.setUserInput(0, 1, 6, "=UNIQUE(A2:A5)");
		expect(model.getFormattedCellValue(0, 1, 6)).toBe("apple");
		expect(model.getFormattedCellValue(0, 2, 6)).toBe("pear");
		expect(model.getFormattedCellValue(0, 3, 6)).toBe("plum");
		expect(model.getCellContent(0, 1, 6)).toBe("=UNIQUE(A2:A5)");
		expect(model.getCellContent(0, 2, 6)).toBe("pear");
	});

	it("reports the whole spill ripple in the delta echo", () => {
		const controller = new WorkbookController(seeded());
		const result = controller.mutate((model) => {
			model.setUserInput(0, 1, 6, "=SORT(B2:B5)");
		});
		if (!result.ok) throw new Error(result.error);
		const cells = result.changes.map((change) => change.cell);
		expect(cells).toEqual(expect.arrayContaining(["F1", "F2", "F3", "F4"]));
	});
});

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { initSync, Model } from "@ironcalc/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { numericValue, parseEngineNumber, selectionStats } from "./cell-stats";
import { CellType, WorkbookController } from "./controller";

/**
 * Runs against the real vendored engine, because the whole point is that the
 * status bar must not fabricate numbers the engine never had.
 */

beforeAll(() => {
	const require = createRequire(import.meta.url);
	const wasmJs = require.resolve("@ironcalc/wasm");
	initSync({ module: readFileSync(join(dirname(wasmJs), "wasm_bg.wasm")) });
});

function withCells(inputs: string[]): WorkbookController {
	const model = new Model("test", "en", "UTC", "en");
	inputs.forEach((input, i) => model.setUserInput(0, i + 1, 1, input));
	return new WorkbookController(model);
}

describe("engine cell types", () => {
	// Pins the TYPE() numbering the controller's CellType enum asserts. The
	// wasm typings return a bare `number`, so if an engine bump renumbers
	// these, fail here rather than in a user's status bar.
	it("matches Excel TYPE() numbering on the pinned build", () => {
		const c = withCells(["42", "hello", "TRUE", "=1/0"]);
		expect(c.cellType(0, 1, 1)).toBe(CellType.Number);
		expect(c.cellType(0, 2, 1)).toBe(CellType.Text);
		expect(c.cellType(0, 3, 1)).toBe(CellType.Logical);
		expect(c.cellType(0, 4, 1)).toBe(CellType.Error);
	});

	// The two inputs that made the old regex fabricate values. Both LOOK
	// numeric to a human and are text to the engine.
	it("treats accounting parens and non-en decimals as text, not numbers", () => {
		const c = withCells(["(1234)", "€1.000,12"]);
		expect(c.cellType(0, 1, 1)).toBe(CellType.Text);
		expect(c.cellType(0, 2, 1)).toBe(CellType.Text);
	});
});

describe("numericValue", () => {
	it("reads literals exactly from content, not from the display string", () => {
		const c = withCells(["42", "12.5", "-3", "$1,234.50", "15%"]);
		expect(numericValue(c, 0, 1, 1)).toBe(42);
		expect(numericValue(c, 0, 2, 1)).toBe(12.5);
		expect(numericValue(c, 0, 3, 1)).toBe(-3);
		// Formatted as "$1,234.50"; content is the canonical "1234.5".
		expect(numericValue(c, 0, 4, 1)).toBe(1234.5);
		// Formatted as "15%"; content is "0.15".
		expect(numericValue(c, 0, 5, 1)).toBe(0.15);
	});

	it("resolves formula results", () => {
		const c = withCells(["=1+2", "=10/4"]);
		expect(numericValue(c, 0, 1, 1)).toBe(3);
		expect(numericValue(c, 0, 2, 1)).toBe(2.5);
	});

	it("returns null rather than a guess for non-numbers", () => {
		const c = withCells(["hello", "TRUE", "=1/0", "", "(1234)", "€1.000,12"]);
		for (let row = 1; row <= 6; row++) {
			expect(numericValue(c, 0, row, 1)).toBeNull();
		}
	});

	it("skips dates instead of summing an unparseable serial", () => {
		const c = withCells(["2026-07-15"]);
		expect(c.cellType(0, 1, 1)).toBe(CellType.Number);
		expect(numericValue(c, 0, 1, 1)).toBeNull();
	});
});

describe("parseEngineNumber", () => {
	it("handles the shapes the engine's own formatter emits", () => {
		expect(parseEngineNumber("3")).toBe(3);
		expect(parseEngineNumber("1,234.50")).toBe(1234.5);
		expect(parseEngineNumber("$1,234.50")).toBe(1234.5);
		// Accounting negatives must keep their sign.
		expect(parseEngineNumber("(1,234.50)")).toBe(-1234.5);
		expect(parseEngineNumber("50%")).toBe(0.5);
		expect(parseEngineNumber("")).toBeNull();
		expect(parseEngineNumber("#DIV/0!")).toBeNull();
	});
});

describe("selectionStats", () => {
	it("sums only real numbers and counts every non-empty cell", () => {
		const c = withCells(["10", "20", "hello", "=5*2", ""]);
		const stats = selectionStats(c, 0, {
			startRow: 1,
			startCol: 1,
			endRow: 5,
			endCol: 1,
		});
		expect(stats.sum).toBe(40);
		expect(stats.numeric).toBe(3);
		expect(stats.filled).toBe(4); // the empty cell is not counted
	});

	// The regression that motivated all of this.
	it("does not fabricate a sum from numeric-looking text", () => {
		const c = withCells(["(1234)", "€1.000,12"]);
		const stats = selectionStats(c, 0, {
			startRow: 1,
			startCol: 1,
			endRow: 2,
			endCol: 1,
		});
		expect(stats.sum).toBe(0);
		expect(stats.numeric).toBe(0);
		expect(stats.filled).toBe(2);
	});
});

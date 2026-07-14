import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { initSync, Model } from "@ironcalc/wasm";
import { Workbook } from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";

import { WorkbookController } from "./controller";
import { buildXlsxBuffer } from "./export-xlsx";

/**
 * Round-trip: build a workbook in the wasm engine, export via
 * buildXlsxBuffer, re-read with exceljs, and assert values, formulas,
 * styles, and multi-sheet structure survive.
 */

beforeAll(() => {
	const require = createRequire(import.meta.url);
	const wasmJs = require.resolve("@ironcalc/wasm");
	initSync({ module: readFileSync(join(dirname(wasmJs), "wasm_bg.wasm")) });
});

describe("buildXlsxBuffer", () => {
	it("round-trips values, formulas, styles, and sheets", async () => {
		const model = new Model("test", "en", "UTC", "en");
		model.setUserInput(0, 1, 1, "Item");
		model.setUserInput(0, 1, 2, "Qty");
		model.setUserInput(0, 2, 1, "Ape");
		model.setUserInput(0, 2, 2, "2");
		model.setUserInput(0, 3, 1, "Bee");
		model.setUserInput(0, 3, 2, "10");
		model.setUserInput(0, 4, 2, "=SUM(B2:B3)");
		model.updateRangeStyle(
			{ sheet: 0, row: 1, column: 1, width: 2, height: 1 },
			"font.b",
			"true",
		);
		model.updateRangeStyle(
			{ sheet: 0, row: 2, column: 2, width: 1, height: 3 },
			"num_fmt",
			"#,##0.00",
		);
		model.newSheet();
		model.setUserInput(1, 1, 1, "second sheet");

		const buffer = await buildXlsxBuffer(new WorkbookController(model));
		expect(buffer.byteLength).toBeGreaterThan(1000);

		const workbook = new Workbook();
		await workbook.xlsx.load(buffer);
		const sheet1 = workbook.getWorksheet("Sheet1");
		const sheet2 = workbook.getWorksheet("Sheet2");
		expect(sheet1).toBeDefined();
		expect(sheet2).toBeDefined();
		if (!sheet1 || !sheet2) return;

		expect(sheet1.getCell("A1").value).toBe("Item");
		expect(sheet1.getCell("A1").font?.bold).toBe(true);
		expect(sheet1.getCell("B2").value).toBe(2);
		expect(sheet1.getCell("B2").numFmt).toBe("#,##0.00");
		const b4 = sheet1.getCell("B4").value;
		expect(b4).toMatchObject({ formula: "SUM(B2:B3)" });
		expect(sheet2.getCell("A1").value).toBe("second sheet");
	});
});

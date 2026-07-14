import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { initSync, Model } from "@ironcalc/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { snapshotSchema } from "@/lib/gsheets-transfer";

import { WorkbookController } from "./controller";
import { buildGoogleSnapshot, modelFromSnapshot } from "./google-snapshot";

/**
 * Round-trip the Google Sheets bridge against the real engine: build a
 * workbook, snapshot it (what "Save to Google Sheets" sends), rebuild a model
 * from that snapshot (what import does), and assert nothing was lost.
 */

beforeAll(() => {
	const require = createRequire(import.meta.url);
	const wasmJs = require.resolve("@ironcalc/wasm");
	initSync({ module: readFileSync(join(dirname(wasmJs), "wasm_bg.wasm")) });
});

describe("google snapshot bridge", () => {
	it("round-trips values, formulas, number formats, and sheets", () => {
		const model = new Model("test", "en", "UTC", "en");
		model.setUserInput(0, 1, 1, "Item");
		model.setUserInput(0, 1, 2, "Qty");
		model.setUserInput(0, 2, 1, "Ape");
		model.setUserInput(0, 2, 2, "2");
		model.setUserInput(0, 3, 1, "Bee");
		model.setUserInput(0, 3, 2, "10.5");
		model.setUserInput(0, 4, 2, "=SUM(B2:B3)");
		model.setUserInput(0, 5, 1, "TRUE");
		model.updateRangeStyle(
			{ sheet: 0, row: 2, column: 2, width: 1, height: 3 },
			"num_fmt",
			"#,##0.00",
		);
		model.newSheet();
		model.renameSheet(1, "Data");
		model.setUserInput(1, 1, 1, "second sheet");

		const snapshot = buildGoogleSnapshot(new WorkbookController(model));
		// The wire contract accepts what the builder produces.
		expect(() => snapshotSchema.parse(snapshot)).not.toThrow();

		expect(snapshot.sheets.map((sheet) => sheet.name)).toEqual(["Sheet1", "Data"]);
		const byPos = new Map(
			snapshot.sheets[0]?.cells.map((cell) => [`${cell.r}:${cell.c}`, cell]),
		);
		expect(byPos.get("1:1")).toMatchObject({ v: "Item" });
		expect(byPos.get("2:2")).toMatchObject({ v: 2, nf: "#,##0.00" });
		expect(byPos.get("3:2")).toMatchObject({ v: 10.5 });
		expect(byPos.get("4:2")).toMatchObject({ f: "=SUM(B2:B3)" });
		expect(byPos.get("5:1")).toMatchObject({ v: true });

		const rebuilt = modelFromSnapshot("test", snapshot);
		expect(rebuilt.getCellContent(0, 1, 1)).toBe("Item");
		expect(rebuilt.getCellContent(0, 4, 2)).toBe("=SUM(B2:B3)");
		expect(rebuilt.getFormattedCellValue(0, 4, 2)).toBe("12.50");
		expect(rebuilt.getCellContent(0, 5, 1)).toBe("TRUE");
		expect(rebuilt.getWorksheetsProperties().map((sheet) => sheet.name)).toEqual([
			"Sheet1",
			"Data",
		]);
		expect(rebuilt.getCellContent(1, 1, 1)).toBe("second sheet");
		rebuilt.free();
		model.free();
	});
});

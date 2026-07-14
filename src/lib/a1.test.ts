import { describe, expect, it } from "vitest";

import {
	columnToLetters,
	formatCell,
	formatRange,
	lettersToColumn,
	parseCell,
	parseRange,
} from "./a1";

describe("column letters", () => {
	it("round-trips single and multi letter columns", () => {
		for (const [col, letters] of [
			[1, "A"],
			[26, "Z"],
			[27, "AA"],
			[28, "AB"],
			[52, "AZ"],
			[53, "BA"],
			[702, "ZZ"],
			[703, "AAA"],
			[16384, "XFD"],
		] as const) {
			expect(columnToLetters(col)).toBe(letters);
			expect(lettersToColumn(letters)).toBe(col);
		}
	});
});

describe("parseCell", () => {
	it("parses plain and absolute refs", () => {
		expect(parseCell("B12")).toEqual({ row: 12, col: 2 });
		expect(parseCell("$B$12")).toEqual({ row: 12, col: 2 });
		expect(parseCell("aa1")).toEqual({ row: 1, col: 27 });
	});

	it("rejects malformed and out-of-bounds refs", () => {
		expect(parseCell("")).toBeNull();
		expect(parseCell("12")).toBeNull();
		expect(parseCell("B")).toBeNull();
		expect(parseCell("B0")).toBeNull();
		expect(parseCell("XFE1")).toBeNull();
		expect(parseCell("A1048577")).toBeNull();
		expect(parseCell("Sheet1!A1")).toBeNull();
	});
});

describe("parseRange", () => {
	it("parses single cells as 1x1 ranges", () => {
		expect(parseRange("C3")).toEqual({
			startRow: 3,
			startCol: 3,
			endRow: 3,
			endCol: 3,
		});
	});

	it("normalizes corner order", () => {
		expect(parseRange("C10:A2")).toEqual({
			startRow: 2,
			startCol: 1,
			endRow: 10,
			endCol: 3,
		});
	});

	it("rejects garbage", () => {
		expect(parseRange("A1:B2:C3")).toBeNull();
		expect(parseRange("A1:")).toBeNull();
		expect(parseRange("nope")).toBeNull();
	});
});

describe("format", () => {
	it("formats cells and collapses 1x1 ranges", () => {
		expect(formatCell({ row: 5, col: 4 })).toBe("D5");
		expect(formatRange({ startRow: 2, startCol: 1, endRow: 10, endCol: 3 })).toBe(
			"A2:C10",
		);
		expect(formatRange({ startRow: 2, startCol: 2, endRow: 2, endCol: 2 })).toBe(
			"B2",
		);
	});
});

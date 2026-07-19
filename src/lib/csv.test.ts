import { describe, expect, it } from "vitest";

import { csvToSnapshot, detectDelimiter, fileStem, parseCsv } from "./csv";

describe("detectDelimiter", () => {
	it("defaults to comma", () => {
		expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
		expect(detectDelimiter("plain text")).toBe(",");
		expect(detectDelimiter("")).toBe(",");
	});

	it("sniffs semicolons and tabs from the first line", () => {
		expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
		expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
	});

	it("ignores delimiters inside quotes and past the first line", () => {
		expect(detectDelimiter('"x;y;z;w",b\n1,2')).toBe(",");
		expect(detectDelimiter("a,b\n1;2;3;4;5")).toBe(",");
	});
});

describe("parseCsv", () => {
	it("parses plain rows", () => {
		expect(parseCsv("a,b,c\n1,2,3")).toEqual([
			["a", "b", "c"],
			["1", "2", "3"],
		]);
	});

	it("handles CRLF and bare-CR line endings", () => {
		expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
		expect(parseCsv("a,b\r1,2")).toEqual([
			["a", "b"],
			["1", "2"],
		]);
	});

	it("handles quoted fields with delimiters, newlines, and doubled quotes", () => {
		expect(parseCsv('"a,b",c\n"line1\nline2","she said ""hi"""')).toEqual([
			["a,b", "c"],
			["line1\nline2", 'she said "hi"'],
		]);
	});

	it("keeps mid-field quotes literal", () => {
		expect(parseCsv('5" pipe,ok')).toEqual([['5" pipe', "ok"]]);
	});

	it("strips a UTF-8 BOM", () => {
		expect(parseCsv("\uFEFFa,b")).toEqual([["a", "b"]]);
	});

	it("keeps empty fields and empty rows positional", () => {
		expect(parseCsv("a,,c\n\n,x")).toEqual([["a", "", "c"], [""], ["", "x"]]);
	});

	it("does not emit a phantom row for a trailing newline", () => {
		expect(parseCsv("a,b\n")).toEqual([["a", "b"]]);
	});

	it("respects an explicit delimiter over sniffing", () => {
		expect(parseCsv("a;b,c", ";")).toEqual([["a", "b,c"]]);
	});
});

describe("csvToSnapshot", () => {
	it("maps non-empty cells to 1-based coordinates as raw strings", () => {
		const snapshot = csvToSnapshot("data", [
			["Plan", "Seats"],
			["", "42"],
		]);
		expect(snapshot).toEqual({
			sheets: [
				{
					name: "data",
					cells: [
						{ r: 1, c: 1, v: "Plan" },
						{ r: 1, c: 2, v: "Seats" },
						{ r: 2, c: 2, v: "42" },
					],
				},
			],
		});
	});

	it("returns null past the cell cap", () => {
		const wide = Array.from({ length: 500 }, () => "x");
		const rows = Array.from({ length: 301 }, () => wide);
		expect(csvToSnapshot("big", rows)).toBeNull();
	});
});

describe("fileStem", () => {
	it("drops the final extension only", () => {
		expect(fileStem("revenue-2026.csv")).toBe("revenue-2026");
		expect(fileStem("report.v2.csv")).toBe("report.v2");
	});

	it("falls back for empty stems", () => {
		expect(fileStem(".csv")).toBe("Imported CSV");
		expect(fileStem("")).toBe("Imported CSV");
	});
});

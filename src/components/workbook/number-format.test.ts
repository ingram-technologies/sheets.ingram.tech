import { describe, expect, it } from "vitest";

import {
	decimalPlaces,
	isPercent,
	stepDecimals,
	togglePercent,
	withDecimals,
} from "./number-format";

describe("decimalPlaces", () => {
	it("reads the formats the toolbar menu offers", () => {
		expect(decimalPlaces("general")).toBe(0);
		expect(decimalPlaces("")).toBe(0);
		expect(decimalPlaces("#,##0.00")).toBe(2);
		expect(decimalPlaces("0.00%")).toBe(2);
		expect(decimalPlaces("$#,##0.00")).toBe(2);
		expect(decimalPlaces("[$€-x-euro2]#,##0.00")).toBe(2);
	});

	it("reports dates and times as having no decimals to step", () => {
		expect(decimalPlaces("yyyy-mm-dd")).toBeNull();
		expect(decimalPlaces("hh:mm")).toBeNull();
	});

	it("ignores digits and points inside a currency tag", () => {
		// The tag carries a "2" and the format none: a scan that read the
		// bracket would report two decimals on an integer format.
		expect(decimalPlaces("[$€-x-euro2]#,##0")).toBe(0);
	});

	it("ignores a point inside quoted literal text", () => {
		expect(decimalPlaces('0.0" approx."')).toBe(1);
		expect(decimalPlaces('#,##0" v.1"')).toBe(0);
	});
});

describe("withDecimals", () => {
	it("adds and removes the fraction run in place", () => {
		expect(withDecimals("#,##0.00", 3)).toBe("#,##0.000");
		expect(withDecimals("#,##0.00", 0)).toBe("#,##0");
		expect(withDecimals("#,##0", 2)).toBe("#,##0.00");
	});

	it("keeps prefixes and suffixes", () => {
		expect(withDecimals("$#,##0.00", 1)).toBe("$#,##0.0");
		expect(withDecimals("0.00%", 0)).toBe("0%");
		expect(withDecimals("[$€-x-euro2]#,##0.00", 3)).toBe("[$€-x-euro2]#,##0.000");
	});

	it("inserts the run before a trailing literal, not after it", () => {
		expect(withDecimals('#,##0" kg"', 2)).toBe('#,##0.00" kg"');
	});

	it("steps every section of a positive;negative format together", () => {
		expect(withDecimals("#,##0.00;(#,##0.00)", 1)).toBe("#,##0.0;(#,##0.0)");
	});

	it("promotes General to a fixed format rather than guessing a currency", () => {
		expect(withDecimals("general", 2)).toBe("0.00");
		expect(withDecimals("general", 0)).toBe("0");
	});

	it("refuses formats with no numeric placeholder", () => {
		expect(withDecimals("yyyy-mm-dd", 2)).toBeNull();
		expect(withDecimals("hh:mm", 1)).toBeNull();
	});

	it("clamps rather than emitting an unreadable run", () => {
		expect(withDecimals("0.00", -3)).toBe("0");
		expect(withDecimals("0.00", 99)).toBe(`0.${"0".repeat(10)}`);
	});
});

describe("stepDecimals", () => {
	it("moves one place at a time and stops at zero", () => {
		expect(stepDecimals("#,##0.00", 1)).toBe("#,##0.000");
		expect(stepDecimals("#,##0.00", -1)).toBe("#,##0.0");
		expect(stepDecimals("#,##0", -1)).toBe("#,##0");
	});

	it("is null where there is nothing to step", () => {
		expect(stepDecimals("yyyy-mm-dd", 1)).toBeNull();
	});
});

describe("percent", () => {
	it("detects a real percent sign, not a quoted one", () => {
		expect(isPercent("0.00%")).toBe(true);
		expect(isPercent('#,##0" 100%"')).toBe(false);
		expect(isPercent("general")).toBe(false);
	});

	it("toggles to the same format the menu offers, and back to General", () => {
		expect(togglePercent("general")).toBe("0.00%");
		expect(togglePercent("#,##0.00")).toBe("0.00%");
		expect(togglePercent("0.00%")).toBe("general");
	});
});

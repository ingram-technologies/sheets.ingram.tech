import { describe, expect, it } from "vitest";

import { changedCellsFromOutput, MAX_OUTPUT_CHARS, truncateOutput } from "./activity";

/**
 * The samples here are verbatim sheetkit output, not invented strings — the
 * whole point of this parser is that it tracks a real rendering format, so a
 * test against a hand-written approximation would prove nothing.
 */

const SET_AND_FILL = `set Sheet1!E1
set Sheet1!E2
filled E2:E4 from E2
expect E2 == 31.5: OK (actual 31.5)
recalc: 4 cells changed
  E1 ⇒ "Total" · E2 ⇒ 31.5 · E3 ⇒ 29.75 · E4 ⇒ 199.98`;

const FAILED_SCRIPT = `set Sheet1!A1
recalc: 1 cell changed
  A1 ⇒ 1
✗ line 2 \`expect A1 == 999\` failed: expectation failed: A1 == 999, actual 1
  (script stopped there; earlier lines ARE applied — see recalc above)`;

describe("changedCellsFromOutput", () => {
	it("finds the cells a delta echo names", () => {
		expect(changedCellsFromOutput(SET_AND_FILL)).toEqual(["E1", "E2", "E3", "E4"]);
	});

	it("takes only cells the echo marks as changed, not every reference it mentions", () => {
		// `expect E2 == 31.5` and `filled E2:E4 from E2` both name cells that
		// did not necessarily change; only the `⇒` lines are claims about a
		// changed value.
		const refs = changedCellsFromOutput(
			"expect Z9 == 3\nfilled B1:B9 from B1\nrecalc: 1 cell changed\n  C3 ⇒ 7",
		);
		expect(refs).toEqual(["C3"]);
	});

	it("reads the partial changes from a script that failed", () => {
		expect(changedCellsFromOutput(FAILED_SCRIPT)).toEqual(["A1"]);
	});

	it("returns nothing rather than throwing when the format is unrecognised", () => {
		expect(changedCellsFromOutput("something else entirely")).toEqual([]);
		expect(changedCellsFromOutput("")).toEqual([]);
	});

	it("caps how many cells it reports, so a huge fill cannot flood the grid", () => {
		const huge = Array.from({ length: 5000 }, (_, i) => `A${i + 1} ⇒ ${i}`).join(
			" · ",
		);
		const refs = changedCellsFromOutput(huge);
		expect(refs.length).toBeLessThanOrEqual(200);
		expect(refs[0]).toBe("A1");
	});

	it("does not report the same cell twice", () => {
		expect(changedCellsFromOutput("A1 ⇒ 1 · A1 ⇒ 2")).toEqual(["A1"]);
	});
});

describe("truncateOutput", () => {
	it("leaves ordinary output alone", () => {
		expect(truncateOutput(SET_AND_FILL)).toBe(SET_AND_FILL);
	});

	it("caps a long echo and says that it did", () => {
		const long = "x".repeat(MAX_OUTPUT_CHARS + 500);
		const result = truncateOutput(long);
		expect(result.length).toBeLessThan(long.length);
		expect(result).toContain("truncated");
	});
});

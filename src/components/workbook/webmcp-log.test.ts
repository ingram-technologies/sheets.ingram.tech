import { describe, expect, it } from "vitest";

import { summarize } from "./webmcp-log";

/**
 * The log reads the tool's own output rather than being told separately what
 * happened, so a change to the executor's echo format silently empties the
 * "N changed" column. Pin the shape it parses.
 */

describe("summarize", () => {
	it("pulls the changed-cell count out of the delta echo", () => {
		const call = summarize(
			"set_cells",
			{ sheet: "Sheet1", start_cell: "B2", rows: [[1, 2, 3]] },
			"ok — 11 cell(s) changed:\n  B2: (empty) ⇒ 1\n  C2: (empty) ⇒ 2",
		);
		expect(call.changed).toBe(11);
		expect(call.result).toBe("ok — 11 cell(s) changed:");
	});

	it("renders a block of cell inputs as its shape, not its contents", () => {
		const call = summarize(
			"set_cells",
			{
				sheet: "Sheet1",
				start_cell: "A1",
				rows: [
					["a", "b"],
					["c", "d"],
					["e", "f"],
				],
			},
			"ok — 6 cell(s) changed",
		);
		expect(call.args).toBe("sheet: Sheet1 · start_cell: A1 · rows: 3×2");
	});

	it("has no count for a read, and keeps the error text for a failure", () => {
		expect(
			summarize("read_range", { sheet: "S", range: "A1" }, "S!A1\n 1 | x")
				.changed,
		).toBe(null);
		const failed = summarize(
			"set_cells",
			{},
			"error: range has 9000 cells (cap 2000)",
		);
		expect(failed.changed).toBe(null);
		expect(failed.result).toBe("error: range has 9000 cells (cap 2000)");
	});
});

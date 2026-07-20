import { describe, expect, it } from "vitest";

import type { CellChange } from "../workbook/controller";
import { burstChipText, UserEditLog } from "./user-edits";

const sheetName = (index: number) => (index === 0 ? "Sheet1" : `Sheet${index + 1}`);

function change(cell: string, oldValue: string, newValue: string): CellChange {
	return { sheet: 0, cell, old: oldValue, new: newValue };
}

describe("UserEditLog pending (the AI attachment)", () => {
	it("merges per cell: first old kept, latest new wins", () => {
		const log = new UserEditLog();
		log.record([change("C3", "29", "31")], sheetName, null);
		log.record([change("C3", "31", "35")], sheetName, null);
		expect(log.takePendingText()).toBe("Sheet1!C3: 29 ⇒ 35");
	});

	it("drops a cell edited back to its original value", () => {
		const log = new UserEditLog();
		log.record([change("C3", "29", "35")], sheetName, null);
		log.record([change("C3", "35", "29")], sheetName, null);
		expect(log.takePendingText()).toBeUndefined();
	});

	it("clears on take, so each turn gets only fresh edits", () => {
		const log = new UserEditLog();
		log.record([change("A1", "", "1")], sheetName, null);
		expect(log.takePendingText()).toBe("Sheet1!A1: (empty) ⇒ 1");
		expect(log.takePendingText()).toBeUndefined();
		log.record([change("A2", "", "2")], sheetName, "m1");
		expect(log.takePendingText()).toBe("Sheet1!A2: (empty) ⇒ 2");
	});

	it("caps the attachment and reports the overflow", () => {
		const log = new UserEditLog();
		const changes = Array.from({ length: 250 }, (_, i) =>
			change(`A${i + 1}`, "", String(i)),
		);
		log.record(changes, sheetName, null);
		const text = log.takePendingText();
		expect(text).toBeDefined();
		const lines = (text ?? "").split("\n");
		expect(lines).toHaveLength(41);
		expect(lines[40]).toBe("… and 210 more cell(s)");
	});
});

describe("UserEditLog bursts (the transcript)", () => {
	it("extends the live burst while the anchor is unchanged, then starts a new one", () => {
		const log = new UserEditLog();
		log.record([change("A1", "", "1")], sheetName, "m1");
		log.record([change("A2", "", "2")], sheetName, "m1");
		log.record([change("A3", "", "3")], sheetName, "m2");
		const bursts = log.getBursts();
		expect(bursts).toHaveLength(2);
		expect(bursts[0]?.edits.map((e) => e.cell)).toEqual(["A1", "A2"]);
		expect(bursts[1]?.afterMessageId).toBe("m2");
	});

	it("removes a burst whose edits all revert", () => {
		const log = new UserEditLog();
		log.record([change("A1", "x", "y")], sheetName, "m1");
		log.record([change("A1", "y", "x")], sheetName, "m1");
		expect(log.getBursts()).toHaveLength(0);
	});

	it("notifies subscribers with a fresh array identity", () => {
		const log = new UserEditLog();
		const before = log.getBursts();
		let notified = 0;
		log.subscribe(() => notified++);
		log.record([change("A1", "", "1")], sheetName, null);
		expect(notified).toBe(1);
		expect(log.getBursts()).not.toBe(before);
	});
});

describe("burstChipText", () => {
	it("shows up to three edits and counts the rest", () => {
		const log = new UserEditLog();
		log.record(
			[
				change("A1", "", "1"),
				change("A2", "", "2"),
				change("A3", "", "3"),
				change("A4", "", "4"),
			],
			sheetName,
			null,
		);
		const burst = log.getBursts()[0];
		if (!burst) throw new Error("expected a burst");
		expect(burstChipText(burst, false)).toBe(
			"You edited A1 (empty) ⇒ 1 · A2 (empty) ⇒ 2 · A3 (empty) ⇒ 3 · 1 more",
		);
	});

	it("sheet-qualifies cells only in multi-sheet workbooks", () => {
		const log = new UserEditLog();
		log.record([change("B2", "1", "2")], sheetName, null);
		const burst = log.getBursts()[0];
		if (!burst) throw new Error("expected a burst");
		expect(burstChipText(burst, true)).toBe("You edited Sheet1!B2 1 ⇒ 2");
	});
});

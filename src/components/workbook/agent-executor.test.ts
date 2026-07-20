import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { initSync, Model } from "@ironcalc/wasm";
import { beforeAll, describe, expect, it } from "vitest";

import { UserEditLog } from "../chat/user-edits";
import { AgentExecutor } from "./agent-executor";
import { WorkbookController } from "./controller";

/**
 * The mid-task seam: user edits made between agent tool calls must surface on
 * the agent's NEXT tool result (drained from the user-edit log), while the
 * agent's own mutations never do.
 */

beforeAll(() => {
	const require = createRequire(import.meta.url);
	const wasmJs = require.resolve("@ironcalc/wasm");
	initSync({ module: readFileSync(join(dirname(wasmJs), "wasm_bg.wasm")) });
});

function harness() {
	const model = new Model("test", "en", "UTC", "en");
	const controller = new WorkbookController(model);
	const log = new UserEditLog();
	controller.onMutation((changes, author) => {
		if (author !== "user" || changes.length === 0) return;
		const sheets = controller.sheets();
		log.record(changes, (i) => sheets[i]?.name ?? `Sheet ${i + 1}`, null);
	});
	const executor = new AgentExecutor(controller, undefined, () =>
		log.takePendingText(),
	);
	return { controller, executor };
}

describe("mid-task user edits reach the next tool result", () => {
	it("appends the note after a user edit, and only then", async () => {
		const { controller, executor } = harness();

		// Agent writes — its own mutation must not trigger the note.
		const first = await executor.execute("set_cells", {
			sheet: "Sheet1",
			start_cell: "A1",
			rows: [["Seats", 40]],
		});
		expect(first).toContain("ok");
		expect(first).not.toContain("user edited meanwhile");

		// The user's hand lands between tool calls.
		controller.mutate((m) => m.setUserInput(0, 1, 2, "55"));

		const second = await executor.execute("read_range", {
			sheet: "Sheet1",
			range: "A1:B1",
		});
		expect(second).toContain("user edited meanwhile");
		expect(second).toContain("Sheet1!B1: 40 ⇒ 55");

		// Drained — the note doesn't repeat on the following call.
		const third = await executor.execute("read_range", {
			sheet: "Sheet1",
			range: "A1:B1",
		});
		expect(third).not.toContain("user edited meanwhile");
	});

	it("attaches the note to error results too", async () => {
		const { controller, executor } = harness();
		controller.mutate((m) => m.setUserInput(0, 1, 1, "7"));
		const output = await executor.execute("read_range", {
			sheet: "Sheet1",
			range: "not-a-range",
		});
		expect(output).toContain("error:");
		expect(output).toContain("user edited meanwhile");
	});
});

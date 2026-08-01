import type { TestDb } from "@ingram-tech/nk-db/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Integration tests for the MCP surface, against a real Postgres (PGlite) and
 * the real wasm engine. Nothing here is mocked: the point is to prove that a
 * tool call actually loads engine bytes, evaluates formulas, persists, and
 * stays scoped to its owner — none of which a stubbed test could show.
 *
 * `src/lib/db.ts` builds its pool from DATABASE_URL at import time, so the
 * test database has to exist and be exported into the environment *before*
 * anything that reaches the db is imported. Hence the dynamic imports.
 *
 * The harness serves exactly one socket connection, and `createTestDb` hands
 * back a `pg.Pool` of its own. Using that alongside the app's — which is what
 * every module under test dials — makes the two fight over the single
 * connection and drops it mid-query. So we take the harness for its database
 * and its ephemeral port, retire its pool, and reach the data the same way the
 * app does.
 */

let testDb: TestDb;
let handleRpc: typeof import("./server").handleRpc;
let execute: typeof import("@/lib/db").execute;
let createWorkbook: typeof import("@/lib/workbooks").createWorkbook;
let getWorkbookMeta: typeof import("@/lib/workbooks").getWorkbookMeta;
let saveWorkbookBytes: typeof import("@/lib/workbooks").saveWorkbookBytes;
let withNewSession: typeof import("@/lib/sheetkit-server").withNewSession;

const ALICE = "11111111-1111-7111-8111-111111111111";
const BOB = "22222222-2222-7222-8222-222222222222";

beforeAll(async () => {
	const { createTestDb } = await import("@ingram-tech/nk-db/pglite");
	const { authMigrationChain } = await import("@/lib/auth-migrations");
	testDb = await createTestDb({ dependencyMigrations: [authMigrationChain] });
	// Hand the single available connection to the app's pool — see above.
	await testDb.pool.end();
	process.env.DATABASE_URL = testDb.databaseUrl;
	({ handleRpc } = await import("./server"));
	({ execute } = await import("@/lib/db"));
	({ createWorkbook, getWorkbookMeta, saveWorkbookBytes } =
		await import("@/lib/workbooks"));
	({ withNewSession } = await import("@/lib/sheetkit-server"));
}, 60_000);

afterAll(async () => {
	// `close` also ends the pool we already retired in beforeAll; the second
	// end throws. Closing the database is the part that matters here.
	await testDb?.close().catch(() => undefined);
});

beforeEach(async () => {
	// CASCADE takes workbooks with their owners, so this is the whole reset.
	await execute(`truncate table "user" cascade`);
	// workbook.user_id is a real FK to Better Auth's `user` table (see
	// drizzle/0004), so the owners have to exist before anything can own
	// anything. Raw SQL because those tables are deliberately outside the
	// drizzle schema.
	for (const [id, email] of [
		[ALICE, "alice@example.com"],
		[BOB, "bob@example.com"],
	]) {
		await execute(
			`insert into "user" ("id", "name", "email", "emailVerified")
			 values ($1, $2, $3, true)`,
			[id, email, email],
		);
	}
});

/** Call a tool the way a client would, and return its text content. */
async function callTool(
	name: string,
	args: Record<string, unknown>,
	userId = ALICE,
): Promise<{ text: string; isError: boolean }> {
	const response = await handleRpc(
		{
			jsonrpc: "2.0",
			id: 1,
			method: "tools/call",
			params: { name, arguments: args },
		},
		userId,
	);
	const result = (
		response as { result: { content: [{ text: string }]; isError: boolean } }
	).result;
	return { text: result.content[0].text, isError: result.isError };
}

/** A workbook owned by `userId`, seeded through the same path the browser uses. */
async function seedWorkbook(userId = ALICE, name = "Book") {
	const bytes = await withNewSession(name, (s) => s.toBytes());
	return createWorkbook({ userId, name, bytes });
}

describe("protocol", () => {
	it("advertises every tool with a JSON Schema", async () => {
		const response = await handleRpc(
			{ jsonrpc: "2.0", id: 1, method: "tools/list" },
			ALICE,
		);
		const { tools } = (
			response as { result: { tools: { name: string; inputSchema: object }[] } }
		).result;
		expect(tools.map((t) => t.name).sort()).toEqual([
			"sheet_create",
			"sheet_exec",
			"sheet_list",
			"sheet_open",
			"sheet_view",
		]);
		for (const tool of tools) {
			expect(tool.inputSchema).toHaveProperty("type", "object");
		}
	});

	it("answers notifications with no body", async () => {
		const response = await handleRpc(
			{ jsonrpc: "2.0", method: "notifications/initialized" },
			ALICE,
		);
		expect(response).toBeNull();
	});

	it("rejects an unknown tool as a protocol error, not a tool result", async () => {
		const response = await handleRpc(
			{
				jsonrpc: "2.0",
				id: 7,
				method: "tools/call",
				params: { name: "sheet_nope" },
			},
			ALICE,
		);
		expect(response).toMatchObject({ id: 7, error: { code: -32601 } });
	});

	it("reports bad arguments without reaching the engine", async () => {
		const response = await handleRpc(
			{
				jsonrpc: "2.0",
				id: 8,
				method: "tools/call",
				params: { name: "sheet_view", arguments: { workbook_id: "wb_x" } },
			},
			ALICE,
		);
		expect(response).toMatchObject({ id: 8, error: { code: -32602 } });
	});
});

describe("sheet_exec", () => {
	it("evaluates formulas and persists the result", async () => {
		const book = await seedWorkbook();
		const result = await callTool("sheet_exec", {
			workbook_id: book.id,
			script: ["set A1 3", "set B1 4", "set C1 =A1*B1", "expect C1 == 12"].join(
				"\n",
			),
		});
		expect(result.isError).toBe(false);
		// The delta echo is the contract: the agent learns the computed value
		// from the write itself.
		expect(result.text).toContain("12");

		// And it survived — a fresh read renders the stored bytes.
		const view = await callTool("sheet_view", {
			workbook_id: book.id,
			target: "A1:C1",
		});
		expect(view.text).toContain("12");
	});

	it("bumps the version and records what the agent did", async () => {
		const book = await seedWorkbook();
		expect(book.version).toBe(1);

		await callTool("sheet_exec", { workbook_id: book.id, script: "set A1 42" });

		const after = await getWorkbookMeta(book.id, ALICE);
		expect(after?.version).toBe(2);
		// This record is what lets an open tab show the edit rather than
		// silently changing under the user.
		expect(after?.lastActivity).toMatchObject({
			author: "claude-code",
			script: "set A1 42",
			version: 2,
		});
	});

	it("discards the whole script when a line fails, rather than half-applying it", async () => {
		const book = await seedWorkbook();
		const result = await callTool("sheet_exec", {
			workbook_id: book.id,
			// `set A1 1` succeeds; the assertion after it does not. sheetkit
			// applies the first line and stops — but a workbook someone may be
			// watching must not be left in that half-done state.
			script: ["set A1 1", "expect A1 == 999"].join("\n"),
		});
		expect(result.isError).toBe(true);
		// The agent still learns exactly which line failed and why.
		expect(result.text).toContain("expect A1 == 999");
		expect(result.text).toContain("actual 1");

		const after = await getWorkbookMeta(book.id, ALICE);
		expect(after?.version).toBe(1);
		expect(after?.lastActivity).toBeNull();
		// And A1 really is empty, not merely un-versioned. The dense rendering
		// puts the row number left of the pipe and the cell value right of it,
		// so an empty cell is a row line with nothing after the pipe.
		const view = await callTool("sheet_view", {
			workbook_id: book.id,
			target: "A1",
		});
		const rowLine = view.text.trimEnd().split("\n").at(-1);
		expect(rowLine?.trim()).toBe("1 |");
	});

	it("still applies a script whose every line succeeds", async () => {
		const book = await seedWorkbook();
		const result = await callTool("sheet_exec", {
			workbook_id: book.id,
			script: ["set A1 1", "expect A1 == 1"].join("\n"),
		});
		expect(result.isError).toBe(false);
		expect((await getWorkbookMeta(book.id, ALICE))?.version).toBe(2);
	});
});

describe("compare-and-swap", () => {
	it("rejects a write that claims a version the workbook has moved past", async () => {
		const book = await seedWorkbook();
		const bytes = await withNewSession("Book", (s) => s.toBytes());

		// The browser writes first, taking the workbook to version 2.
		const first = await saveWorkbookBytes(book.id, ALICE, bytes, book.version);
		expect(first).toMatchObject({ ok: true });

		// An MCP client that read at version 1 now tries to write. Without the
		// CAS this would silently discard the write above.
		const stale = await saveWorkbookBytes(book.id, ALICE, bytes, book.version);
		expect(stale).toMatchObject({ ok: false, reason: "conflict" });
		// The loser is told where things actually stand, so it can re-read
		// rather than guess.
		if (!stale.ok && stale.reason === "conflict") {
			expect(stale.meta.version).toBe(2);
		}
	});

	it("distinguishes a missing workbook from a conflict", async () => {
		const bytes = await withNewSession("Book", (s) => s.toBytes());
		const result = await saveWorkbookBytes("wb_doesnotexist", ALICE, bytes, 1);
		expect(result).toMatchObject({ ok: false, reason: "not_found" });
	});
});

describe("ownership", () => {
	it("hides another user's workbook from every tool", async () => {
		const book = await seedWorkbook(ALICE);

		const open = await callTool("sheet_open", { workbook_id: book.id }, BOB);
		expect(open.isError).toBe(true);
		expect(open.text).toContain("No workbook");

		const exec = await callTool(
			"sheet_exec",
			{ workbook_id: book.id, script: "set A1 666" },
			BOB,
		);
		expect(exec.isError).toBe(true);

		// Alice's workbook is untouched by Bob's attempt.
		const after = await getWorkbookMeta(book.id, ALICE);
		expect(after?.version).toBe(1);
	});

	it("lists only the caller's own workbooks", async () => {
		await seedWorkbook(ALICE, "Alice's book");
		await seedWorkbook(BOB, "Bob's book");

		const alice = await callTool("sheet_list", {}, ALICE);
		expect(alice.text).toContain("Alice's book");
		expect(alice.text).not.toContain("Bob's book");
	});
});

describe("sheet_create", () => {
	it("seeds from CSV and sketches the structure it found", async () => {
		const result = await callTool("sheet_create", {
			name: "Orders",
			csv: ["Order,City,Qty", "A-1,Vienna,3", "A-2,Rome,7"].join("\n"),
		});
		expect(result.isError).toBe(false);
		// The sketch is structure-aware — it reports the detected region and
		// inferred column types, not a cell dump.
		expect(result.text).toContain("Orders");
		expect(result.text).toMatch(/Qty/);

		const list = await callTool("sheet_list", {});
		expect(list.text).toContain("Orders");
	});
});

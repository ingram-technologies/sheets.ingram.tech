import type { TestDb } from "@ingram-tech/nk-db/pglite";
import { makeSignature } from "better-auth/crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

/**
 * User ids are `usr_…` wherever the browser or an outside program sees them,
 * while Better Auth's tables keep the raw uuid. Against a real PGlite, with the
 * same dynamic-import dance as mcp.test.ts (db.ts dials DATABASE_URL on import).
 */

const USR = /^usr_[1-9A-HJ-NP-Za-km-z]{22}$/;
const RAW = "33333333-3333-7333-8333-333333333333";
const SECRET = "public-ids-test-secret-at-least-32-characters";
const ORIGIN = "http://localhost:3000";

let testDb: TestDb;
let auth: typeof import("@/lib/auth").auth;
let execute: typeof import("@/lib/db").execute;
let workbooks: typeof import("@/lib/workbooks");
let connectedApps: typeof import("@/lib/connected-apps");

beforeAll(async () => {
	const { createTestDb } = await import("@ingram-tech/nk-db/pglite");
	const { authMigrationChain } = await import("@/lib/auth-migrations");
	testDb = await createTestDb({ dependencyMigrations: [authMigrationChain] });
	await testDb.pool.end();
	process.env.DATABASE_URL = testDb.databaseUrl;
	process.env.BETTER_AUTH_SECRET = SECRET;
	process.env.BETTER_AUTH_URL = ORIGIN;
	({ auth } = await import("@/lib/auth"));
	({ execute } = await import("@/lib/db"));
	workbooks = await import("@/lib/workbooks");
	connectedApps = await import("@/lib/connected-apps");
	await execute(
		`insert into "user" ("id", "name", "email", "emailVerified")
		 values ($1, 'Public Ids', 'public-ids@example.com', true)`,
		[RAW],
	);
}, 60_000);

afterAll(async () => {
	await testDb?.close().catch(() => undefined);
});

/** A signed session cookie for RAW, as a Google sign-in would leave it. */
async function sessionCookie(): Promise<string> {
	const { internalAdapter } = await auth.$context;
	const { token } = await internalAdapter.createSession(RAW);
	const signed = `${token}.${await makeSignature(token, SECRET)}`;
	return `better-auth.session_token=${encodeURIComponent(signed)}`;
}

describe("public user ids", () => {
	it("get-session hands the browser usr_ ids", async () => {
		const res = await auth.handler(
			new Request(`${ORIGIN}/auth/get-session`, {
				headers: { cookie: await sessionCookie(), origin: ORIGIN },
			}),
		);
		expect(res.status).toBe(200);
		const session = z
			.object({
				user: z.object({ id: z.string() }),
				session: z.object({ userId: z.string() }),
			})
			.parse(await res.json());
		expect(session.user.id).toMatch(USR);
		expect(session.session.userId).toBe(session.user.id);
	});

	it("stores the raw uuid and finds it by usr_ id or raw MCP subject", async () => {
		const { ids } = await import("@/lib/ids");
		const usr = ids.user.encode(RAW);
		const created = await workbooks.createWorkbook({
			userId: usr,
			name: "Owned",
			bytes: new Uint8Array([1]),
		});
		// A write's row count: 1 only if the stored value is the raw uuid.
		expect(
			await execute(`update workbook set name = name where user_id = $1`, [RAW]),
		).toBe(1);
		for (const owner of [usr, RAW]) {
			const listed = await workbooks.listWorkbooks(owner);
			expect(listed.map((w) => w.id)).toEqual([created.id]);
		}
		expect(await connectedApps.listConnectedApps(usr)).toEqual([]);
	});
});

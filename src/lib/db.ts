import { createDb, createPool, createQueries } from "@ingram-tech/nk-db";
import type { Pool } from "pg";

import * as schema from "./schema";

// Turbopack may re-evaluate this module while developing. PGlite exposes one
// persistent socket connection, so a second pool causes it to terminate that
// connection. Reuse the process pool across reloads; it also keeps Better Auth
// and app queries on the same connection.
const globalForDb = globalThis as typeof globalThis & {
	sheetsPool?: Pool;
};

export const pool = globalForDb.sheetsPool ?? createPool();
globalForDb.sheetsPool = pool;
export const db = createDb(pool, schema);
export const { execute } = createQueries(pool);
export { schema };

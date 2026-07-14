import { createDb, createPool, createQueries } from "@ingram-tech/nk-db";

import * as schema from "./schema";

export const pool = createPool();
export const db = createDb(pool, schema);
export const { execute } = createQueries(pool);
export { schema };

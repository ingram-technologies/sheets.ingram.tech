import { createIdRegistry, SHARED_ID_PREFIXES } from "@ingram-tech/nk-db/id";
import { createIdColumns } from "@ingram-tech/nk-db/id/drizzle";

/**
 * Public-id registry (nextkit house rule): rows store hyphenated UUIDv7, and
 * anything crossing a public contract (URLs, API payloads, the session the
 * browser sees, outbound calls) is skinned to `wb_<base58>` / `usr_<base58>`.
 * Raw UUIDs never leave the server.
 */
export const ids = createIdRegistry({
	workbook: "wb",
	user: SHARED_ID_PREFIXES.user,
});

/**
 * `idColumn("workbook")` types the uuid column in schema.ts and is the *only*
 * place the codec runs: it decodes a skinned `wb_…` id on the way into a query
 * and encodes the stored uuid on the way out, so application code never sees a
 * raw uuid and never converts by hand. `idColumn("user")` covers the
 * references to Better Auth's `user.id`, a uuid like every other id.
 */
export const { idColumn } = createIdColumns(ids);

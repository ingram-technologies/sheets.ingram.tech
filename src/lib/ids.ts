import { createIdRegistry, SHARED_ID_PREFIXES } from "@ingram-tech/nk-db/id";
import { createIdColumns } from "@ingram-tech/nk-db/id/drizzle";
import { customType } from "drizzle-orm/pg-core";

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
 * raw uuid and never converts by hand. TypeScript-only: `dataType` stays
 * `uuid`, no DDL, no migration.
 */
export const { idColumn } = createIdColumns(ids);

/**
 * `idColumn` for a reference to Better Auth's `user.id`, which nk-auth's chain
 * stores as `text` (holding a UUIDv7). Same codec, `text` on the driver side,
 * so drizzle-kit sees no schema diff. Only `usr_…` goes in; a raw uuid throws.
 */
export const userIdColumn = customType<{ data: string; driverData: string }>({
	dataType: () => "text",
	toDriver: (value) => ids.user.decode(value),
	fromDriver: (value) => ids.user.encode(value),
});

/**
 * The raw id Better Auth's own adapter, `auth.api.*` calls and OAuth tables
 * take (nk-auth README: they stay raw), from the app's `usr_…`. Throws on
 * anything else.
 */
export const authUserId = (id: string): string => ids.user.decode(id);

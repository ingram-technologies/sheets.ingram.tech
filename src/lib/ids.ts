import { createIdRegistry } from "@ingram-tech/nk-db/id";
import { createIdColumns } from "@ingram-tech/nk-db/id/drizzle";

/**
 * Public-id registry (nextkit house rule): rows store hyphenated UUIDv7
 * (`uuid` columns, DB-minted via `uuidv7()` on Postgres 18), and anything
 * crossing a public contract — URLs, API payloads — is skinned to
 * `wb_<base58>`. Raw UUIDs never leave the server.
 */
export const ids = createIdRegistry({ workbook: "wb" });

/**
 * `idColumn("workbook")` types the uuid column in schema.ts so a skinned
 * `wb_…` id reaching a typed query is decoded in `toDriver` instead of
 * blowing up as `invalid input syntax for type uuid`. TypeScript-only:
 * `dataType` stays `uuid`, no DDL, no migration.
 */
export const { idColumn } = createIdColumns(ids);

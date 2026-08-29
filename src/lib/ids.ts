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
 * `idColumn("workbook")` types the uuid column in schema.ts and is the *only*
 * place the codec runs: it decodes a skinned `wb_…` id on the way into a query
 * and encodes the stored uuid on the way out, so application code never sees a
 * raw uuid and never converts by hand. TypeScript-only: `dataType` stays
 * `uuid`, no DDL, no migration.
 */
export const { idColumn } = createIdColumns(ids);

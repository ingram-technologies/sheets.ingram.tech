import { createIdRegistry } from "@ingram-tech/nk-db/id";

/**
 * Public-id registry (nextkit house rule): rows store hyphenated UUIDv7
 * (`uuid` columns, DB-minted via `uuidv7()` on Postgres 18), and anything
 * crossing a public contract — URLs, API payloads — is skinned to
 * `wb_<base58>`. Raw UUIDs never leave the server.
 */
export const ids = createIdRegistry({ workbook: "wb" });

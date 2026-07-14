import { sql } from "drizzle-orm";
import { customType, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * Workbook bytes are the IronCalc native serialization (`Model.toBytes()`),
 * produced and consumed exclusively by the in-browser engine. The server
 * stores them as an opaque blob — it never parses spreadsheet content.
 */
const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
	dataType: () => "bytea",
	fromDriver: (value) => new Uint8Array(value),
	toDriver: (value) => Buffer.from(value),
});

export const workbooks = pgTable("workbook", {
	// UUIDv7 at rest (DB-minted — Postgres ≥18 everywhere: prod RDS 18.4,
	// PGlite 18 in dev); exposed publicly only as `wb_<base58>` via lib/ids.
	id: uuid("id")
		.primaryKey()
		.default(sql`uuidv7()`),
	name: text("name").notNull(),
	bytes: bytea("bytes").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

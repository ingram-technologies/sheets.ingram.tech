import { sql } from "drizzle-orm";
import { customType, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { idColumn } from "./ids";

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

export const workbooks = pgTable(
	"workbook",
	{
		// UUIDv7 at rest (DB-minted — Postgres ≥18 everywhere: prod RDS 18.4,
		// PGlite 18 in dev); exposed publicly only as `wb_<base58>` via lib/ids.
		// idColumn decodes a skinned `wb_…` id in queries before it hits Postgres.
		id: idColumn("workbook")("id")
			.primaryKey()
			.default(sql`uuidv7()`),
		// Owner. Every read and write in lib/workbooks.ts is scoped by this —
		// there is no unscoped query, by construction. Better Auth's `user`
		// table is raw SQL (drizzle/0001) and carries deny-all RLS, so it is
		// deliberately NOT a drizzle table: declaring it here would make
		// drizzle-kit try to manage Better Auth's schema. The FK
		// (ON DELETE cascade) is therefore hand-written in drizzle/0004.
		userId: text("user_id").notNull(),
		name: text("name").notNull(),
		bytes: bytea("bytes").notNull(),
		// 1:1 link to a Google Sheets spreadsheet ("Save to Google Sheets"
		// re-saves to it; import sets it). External id we don't mint → text.
		googleSpreadsheetId: text("google_spreadsheet_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		// Serves the only list query: this owner's workbooks, newest first.
		index("workbook_user_id_updated_at_idx").on(
			table.userId,
			table.updatedAt.desc(),
		),
	],
);

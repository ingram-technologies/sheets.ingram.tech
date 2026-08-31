import { sql } from "drizzle-orm";
import {
	customType,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";

import type { WorkbookActivity } from "./activity";
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
		// Optimistic-concurrency counter, bumped on every bytes write.
		//
		// A workbook now has two writers — the browser's autosave and the MCP
		// endpoint (Claude Code, no tab open) — and `bytes` is a whole-blob
		// replace, so an unconditional write silently discards whatever the
		// other writer did since it read. Every save is therefore a
		// compare-and-swap on this column: a stale writer is rejected and
		// re-reads instead of clobbering. sheetd will make this moot by
		// serializing commands server-side; until then this is the guard.
		version: integer("version").notNull().default(1),
		// What an MCP client last did here, so an open tab can show the edit
		// instead of just silently changing. Latest-only by design — see
		// lib/activity.ts.
		lastActivity: jsonb("last_activity").$type<WorkbookActivity>(),
		// 1:1 link to a Google Sheets spreadsheet ("Save to Google Sheets"
		// re-saves to it; import sets it). External id we don't mint → text.
		googleSpreadsheetId: text("google_spreadsheet_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		// Soft delete: a "Deleted" workbook moves to the trash (recoverable)
		// rather than being erased. NULL = live; a timestamp = when it was
		// trashed. Every active read/write filters on IS NULL (see lib/workbooks).
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
	},
	(table) => [
		// Serves the only list query: this owner's workbooks, newest first.
		index("workbook_user_id_updated_at_idx").on(
			table.userId,
			table.updatedAt.desc(),
		),
	],
);

/**
 * A user's own Ingram Cloud project token — the seam between "whose chat is
 * this" and "which IC project runs and pays for it" (`src/lib/inference.ts`).
 * Sheets holds no inference key of its own: no row → no agent for that user.
 *
 * `user_id` is Better Auth's id; like `workbook.user_id` the FK to `user` is
 * hand-written (drizzle/0010) because Better Auth's tables are deliberately
 * not in this schema.
 */
export const inferenceCredential = pgTable("inference_credential", {
	userId: text("user_id").primaryKey(),
	/** AES-256-GCM under SHEETS_CREDENTIALS_KEY (`src/lib/secrets.ts`). */
	tokenCiphertext: text("token_ciphertext").notNull(),
	/** The token's tail — the only part ever shown again. */
	tokenHint: text("token_hint").notNull(),
	/** Minted by IC's app grant (`src/lib/ic-oauth.ts`) or pasted by hand. An
	 *  OAuth-linked user can be sent to IC's billing page with a return URL; a
	 *  pasted one cannot. */
	source: text("source", { enum: ["oauth", "paste"] }).notNull(),
	/** IC API origin override; null → the SDK default. */
	baseUrl: text("base_url"),
	/** The Sheets agent in THAT project (`agt_…`, IC-minted). */
	agentId: text("agent_id").notNull(),
	/** `AGENT_SIG` at publish time; drift triggers a reconcile. */
	agentSig: text("agent_sig").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
	/** Last chat/provisioning failure, surfaced in the setup dialog; cleared
	 *  on the next success. */
	lastError: text("last_error"),
	lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
});

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { type WorkbookActivity, workbookActivitySchema } from "./activity";
import { db, schema } from "./db";
import { ids } from "./ids";

export const workbookMetaSchema = z.object({
	id: z.string(),
	name: z.string(),
	size: z.number(),
	// Bumped on every bytes write; the token for compare-and-swap saves.
	version: z.number(),
	// What an MCP client last did here; null if nothing has.
	lastActivity: workbookActivitySchema.nullable(),
	googleSpreadsheetId: z.string().nullable(),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	// Set only for trashed workbooks; null for live ones.
	deletedAt: z.iso.datetime().nullable(),
});

export type WorkbookMeta = z.infer<typeof workbookMetaSchema>;

const metaColumns = {
	id: schema.workbooks.id,
	name: schema.workbooks.name,
	size: sql<number>`octet_length(${schema.workbooks.bytes})`.mapWith(Number),
	version: schema.workbooks.version,
	lastActivity: schema.workbooks.lastActivity,
	googleSpreadsheetId: schema.workbooks.googleSpreadsheetId,
	createdAt: schema.workbooks.createdAt,
	updatedAt: schema.workbooks.updatedAt,
	deletedAt: schema.workbooks.deletedAt,
};

// No id conversion happens here. The schema's `idColumn` is the whole codec
// boundary: it decodes a public `wb_…` id on the way into a query and encodes
// the stored uuid on the way out, so a selected `id` is already skinned. What
// is left is validation — `ids.workbook.is` rejects a malformed or foreign id
// so it behaves exactly like a missing row (404, not a Postgres type error)
// instead of reaching the database at all.
function toMeta(row: {
	id: string;
	name: string;
	size: number;
	version: number;
	lastActivity: WorkbookActivity | null;
	googleSpreadsheetId: string | null;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}): WorkbookMeta {
	return {
		id: row.id,
		name: row.name,
		size: row.size,
		version: row.version,
		lastActivity: row.lastActivity,
		googleSpreadsheetId: row.googleSpreadsheetId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
	};
}

/**
 * Every function here takes the owning `userId` and folds it into the WHERE
 * clause. This is the whole isolation model: there is no unscoped read or
 * write, so a route that forgets to scope cannot compile rather than quietly
 * serving someone else's workbook.
 *
 * A workbook owned by another user is reported as *missing*, never as
 * forbidden — a 403 would confirm the id exists, which is itself a leak given
 * ids are enumerable-ish. Callers turn null into a 404.
 */
function owned(id: string, userId: string) {
	return and(
		eq(schema.workbooks.id, id),
		eq(schema.workbooks.userId, userId),
		// Live rows only: a trashed workbook is treated as missing by every
		// read/write. Trash-specific queries below opt back in explicitly.
		isNull(schema.workbooks.deletedAt),
	);
}

export async function listWorkbooks(userId: string): Promise<WorkbookMeta[]> {
	const rows = await db
		.select(metaColumns)
		.from(schema.workbooks)
		.where(
			and(
				eq(schema.workbooks.userId, userId),
				isNull(schema.workbooks.deletedAt),
			),
		)
		.orderBy(desc(schema.workbooks.updatedAt));
	return rows.map(toMeta);
}

/** The owner's trashed workbooks, most-recently-deleted first. */
export async function listDeletedWorkbooks(userId: string): Promise<WorkbookMeta[]> {
	const rows = await db
		.select(metaColumns)
		.from(schema.workbooks)
		.where(
			and(
				eq(schema.workbooks.userId, userId),
				isNotNull(schema.workbooks.deletedAt),
			),
		)
		.orderBy(desc(schema.workbooks.deletedAt));
	return rows.map(toMeta);
}

export async function getWorkbookMeta(
	id: string,
	userId: string,
): Promise<WorkbookMeta | null> {
	if (!ids.workbook.is(id)) return null;
	const rows = await db
		.select(metaColumns)
		.from(schema.workbooks)
		.where(owned(id, userId));
	const row = rows[0];
	return row ? toMeta(row) : null;
}

export async function createWorkbook(input: {
	userId: string;
	name: string;
	bytes: Uint8Array;
	googleSpreadsheetId?: string;
}): Promise<WorkbookMeta> {
	const rows = await db.insert(schema.workbooks).values(input).returning(metaColumns);
	const row = rows[0];
	if (!row) throw new Error("insert returned no row");
	return toMeta(row);
}

/** Record (or refresh) the 1:1 link after a "Save to Google Sheets". */
export async function linkGoogleSpreadsheet(
	id: string,
	userId: string,
	googleSpreadsheetId: string,
): Promise<boolean> {
	if (!ids.workbook.is(id)) return false;
	const rows = await db
		.update(schema.workbooks)
		.set({ googleSpreadsheetId })
		.where(owned(id, userId))
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

/**
 * Bytes plus the version that produced them — the read half of a
 * compare-and-swap. Callers that intend to write back must use this rather
 * than {@link getWorkbookBytes}, so the version they hold provably matches the
 * bytes they edited.
 */
export async function getWorkbookForEdit(
	id: string,
	userId: string,
): Promise<{ bytes: Uint8Array; meta: WorkbookMeta } | null> {
	if (!ids.workbook.is(id)) return null;
	const rows = await db
		.select({ ...metaColumns, bytes: schema.workbooks.bytes })
		.from(schema.workbooks)
		.where(owned(id, userId));
	const row = rows[0];
	if (!row) return null;
	const { bytes, ...meta } = row;
	return { bytes, meta: toMeta(meta) };
}

export type SaveResult =
	| { ok: true; meta: WorkbookMeta }
	| { ok: false; reason: "not_found" }
	/** Someone else wrote since `expectedVersion` was read; `meta` is current. */
	| { ok: false; reason: "conflict"; meta: WorkbookMeta };

/**
 * Compare-and-swap the workbook blob.
 *
 * `expectedVersion` is the version the caller's bytes were derived from. If
 * the row has moved on — the other writer saved first — nothing is written and
 * the caller is told the current state so it can re-read and reapply. This is
 * the only write path for `bytes`; there is deliberately no unconditional
 * variant, because `bytes` is a whole-blob replace and a blind write is
 * indistinguishable from silently deleting the other writer's work.
 */
export async function saveWorkbookBytes(
	id: string,
	userId: string,
	bytes: Uint8Array,
	expectedVersion: number,
	/** Set by MCP writes so an open tab can show what the agent did. Omitted
	 *  by the browser's own autosave, which has nothing to announce. */
	activity?: Omit<WorkbookActivity, "version">,
): Promise<SaveResult> {
	if (!ids.workbook.is(id)) return { ok: false, reason: "not_found" };
	const rows = await db
		.update(schema.workbooks)
		.set({
			bytes,
			updatedAt: new Date(),
			version: sql`${schema.workbooks.version} + 1`,
			// The CAS guarantees the row was at expectedVersion, so the version
			// this write produces is exactly one past it.
			...(activity
				? { lastActivity: { ...activity, version: expectedVersion + 1 } }
				: {}),
		})
		.where(and(owned(id, userId), eq(schema.workbooks.version, expectedVersion)))
		.returning(metaColumns);
	const row = rows[0];
	if (row) return { ok: true, meta: toMeta(row) };

	// Zero rows means either the workbook is gone/not ours, or the version
	// moved. Only a follow-up read can tell those apart, and the difference
	// matters: one is a 404, the other is a retryable conflict.
	const current = await getWorkbookMeta(id, userId);
	return current
		? { ok: false, reason: "conflict", meta: current }
		: { ok: false, reason: "not_found" };
}

export async function renameWorkbook(
	id: string,
	userId: string,
	name: string,
): Promise<WorkbookMeta | null> {
	if (!ids.workbook.is(id)) return null;
	const rows = await db
		.update(schema.workbooks)
		.set({ name, updatedAt: new Date() })
		.where(owned(id, userId))
		.returning(metaColumns);
	const row = rows[0];
	return row ? toMeta(row) : null;
}

/** Move a live workbook to the trash (recoverable). */
export async function trashWorkbook(id: string, userId: string): Promise<boolean> {
	if (!ids.workbook.is(id)) return false;
	const rows = await db
		.update(schema.workbooks)
		.set({ deletedAt: new Date() })
		.where(owned(id, userId))
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

/** Restore a trashed workbook back to the live list. */
export async function restoreWorkbook(id: string, userId: string): Promise<boolean> {
	if (!ids.workbook.is(id)) return false;
	const rows = await db
		.update(schema.workbooks)
		.set({ deletedAt: null })
		.where(
			and(
				eq(schema.workbooks.id, id),
				eq(schema.workbooks.userId, userId),
				isNotNull(schema.workbooks.deletedAt),
			),
		)
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

/** Permanently erase a workbook. Only a *trashed* one can be hard-deleted, so a
 *  live workbook can never be destroyed in a single step. */
export async function deleteWorkbookPermanently(
	id: string,
	userId: string,
): Promise<boolean> {
	if (!ids.workbook.is(id)) return false;
	const rows = await db
		.delete(schema.workbooks)
		.where(
			and(
				eq(schema.workbooks.id, id),
				eq(schema.workbooks.userId, userId),
				isNotNull(schema.workbooks.deletedAt),
			),
		)
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

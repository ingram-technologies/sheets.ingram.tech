import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "./db";
import { ids } from "./ids";

export const workbookMetaSchema = z.object({
	id: z.string(),
	name: z.string(),
	size: z.number(),
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
	googleSpreadsheetId: schema.workbooks.googleSpreadsheetId,
	createdAt: schema.workbooks.createdAt,
	updatedAt: schema.workbooks.updatedAt,
	deletedAt: schema.workbooks.deletedAt,
};

// The id codec lives at this boundary: rows carry UUIDv7, everything returned
// or accepted here uses the public `wb_…` skin. The explicit decodeOrNull
// gates are validation, not translation — a malformed/mismatched public id
// behaves exactly like a missing row (404, not a Postgres type error). The
// schema's idColumn additionally decodes any skinned id that reaches a typed
// query, so a missed decode elsewhere can no longer 500.
function toMeta(row: {
	id: string;
	name: string;
	size: number;
	googleSpreadsheetId: string | null;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}): WorkbookMeta {
	return {
		id: ids.workbook.encode(row.id),
		name: row.name,
		size: row.size,
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
function owned(uuid: string, userId: string) {
	return and(
		eq(schema.workbooks.id, uuid),
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
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return null;
	const rows = await db
		.select(metaColumns)
		.from(schema.workbooks)
		.where(owned(uuid, userId));
	const row = rows[0];
	return row ? toMeta(row) : null;
}

export async function getWorkbookBytes(
	id: string,
	userId: string,
): Promise<Uint8Array | null> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return null;
	const rows = await db
		.select({ bytes: schema.workbooks.bytes })
		.from(schema.workbooks)
		.where(owned(uuid, userId));
	return rows[0]?.bytes ?? null;
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
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return false;
	const rows = await db
		.update(schema.workbooks)
		.set({ googleSpreadsheetId })
		.where(owned(uuid, userId))
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

export async function saveWorkbookBytes(
	id: string,
	userId: string,
	bytes: Uint8Array,
): Promise<WorkbookMeta | null> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return null;
	const rows = await db
		.update(schema.workbooks)
		.set({ bytes, updatedAt: new Date() })
		.where(owned(uuid, userId))
		.returning(metaColumns);
	const row = rows[0];
	return row ? toMeta(row) : null;
}

export async function renameWorkbook(
	id: string,
	userId: string,
	name: string,
): Promise<WorkbookMeta | null> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return null;
	const rows = await db
		.update(schema.workbooks)
		.set({ name, updatedAt: new Date() })
		.where(owned(uuid, userId))
		.returning(metaColumns);
	const row = rows[0];
	return row ? toMeta(row) : null;
}

/** Move a live workbook to the trash (recoverable). */
export async function trashWorkbook(id: string, userId: string): Promise<boolean> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return false;
	const rows = await db
		.update(schema.workbooks)
		.set({ deletedAt: new Date() })
		.where(owned(uuid, userId))
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

/** Restore a trashed workbook back to the live list. */
export async function restoreWorkbook(id: string, userId: string): Promise<boolean> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return false;
	const rows = await db
		.update(schema.workbooks)
		.set({ deletedAt: null })
		.where(
			and(
				eq(schema.workbooks.id, uuid),
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
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return false;
	const rows = await db
		.delete(schema.workbooks)
		.where(
			and(
				eq(schema.workbooks.id, uuid),
				eq(schema.workbooks.userId, userId),
				isNotNull(schema.workbooks.deletedAt),
			),
		)
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

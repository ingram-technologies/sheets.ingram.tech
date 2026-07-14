import { desc, eq, sql } from "drizzle-orm";
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
});

export type WorkbookMeta = z.infer<typeof workbookMetaSchema>;

const metaColumns = {
	id: schema.workbooks.id,
	name: schema.workbooks.name,
	size: sql<number>`octet_length(${schema.workbooks.bytes})`.mapWith(Number),
	googleSpreadsheetId: schema.workbooks.googleSpreadsheetId,
	createdAt: schema.workbooks.createdAt,
	updatedAt: schema.workbooks.updatedAt,
};

// The id codec lives at this boundary: rows carry UUIDv7, everything returned
// or accepted here uses the public `wb_…` skin. A malformed/mismatched public
// id decodes to null and behaves exactly like a missing row.
function toMeta(row: {
	id: string;
	name: string;
	size: number;
	googleSpreadsheetId: string | null;
	createdAt: Date;
	updatedAt: Date;
}): WorkbookMeta {
	return {
		id: ids.workbook.encode(row.id),
		name: row.name,
		size: row.size,
		googleSpreadsheetId: row.googleSpreadsheetId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export async function listWorkbooks(): Promise<WorkbookMeta[]> {
	const rows = await db
		.select(metaColumns)
		.from(schema.workbooks)
		.orderBy(desc(schema.workbooks.updatedAt));
	return rows.map(toMeta);
}

export async function getWorkbookMeta(id: string): Promise<WorkbookMeta | null> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return null;
	const rows = await db
		.select(metaColumns)
		.from(schema.workbooks)
		.where(eq(schema.workbooks.id, uuid));
	const row = rows[0];
	return row ? toMeta(row) : null;
}

export async function getWorkbookBytes(id: string): Promise<Uint8Array | null> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return null;
	const rows = await db
		.select({ bytes: schema.workbooks.bytes })
		.from(schema.workbooks)
		.where(eq(schema.workbooks.id, uuid));
	return rows[0]?.bytes ?? null;
}

export async function createWorkbook(input: {
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
	googleSpreadsheetId: string,
): Promise<boolean> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return false;
	const rows = await db
		.update(schema.workbooks)
		.set({ googleSpreadsheetId })
		.where(eq(schema.workbooks.id, uuid))
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

export async function saveWorkbookBytes(
	id: string,
	bytes: Uint8Array,
): Promise<WorkbookMeta | null> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return null;
	const rows = await db
		.update(schema.workbooks)
		.set({ bytes, updatedAt: new Date() })
		.where(eq(schema.workbooks.id, uuid))
		.returning(metaColumns);
	const row = rows[0];
	return row ? toMeta(row) : null;
}

export async function renameWorkbook(
	id: string,
	name: string,
): Promise<WorkbookMeta | null> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return null;
	const rows = await db
		.update(schema.workbooks)
		.set({ name, updatedAt: new Date() })
		.where(eq(schema.workbooks.id, uuid))
		.returning(metaColumns);
	const row = rows[0];
	return row ? toMeta(row) : null;
}

export async function deleteWorkbook(id: string): Promise<boolean> {
	const uuid = ids.workbook.decodeOrNull(id);
	if (!uuid) return false;
	const rows = await db
		.delete(schema.workbooks)
		.where(eq(schema.workbooks.id, uuid))
		.returning({ id: schema.workbooks.id });
	return rows.length > 0;
}

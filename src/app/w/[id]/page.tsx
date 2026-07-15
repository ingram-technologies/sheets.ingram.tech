import { notFound } from "next/navigation";
import { cache } from "react";

import { Workbook } from "@/components/workbook/Workbook";
import { getUser, requireUser } from "@/lib/session";
import { getWorkbookMeta } from "@/lib/workbooks";

export const dynamic = "force-dynamic";

/**
 * The page and generateMetadata both need this workbook, and Next calls them
 * for the same request — `cache` collapses that into one query per request
 * instead of two. Scoped by owner, so an id belonging to someone else is
 * indistinguishable from one that doesn't exist.
 */
const loadWorkbook = cache(async (id: string, userId: string) =>
	getWorkbookMeta(id, userId),
);

export default async function WorkbookPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const user = await requireUser();
	const { id } = await params;
	const meta = await loadWorkbook(id, user.id);
	if (!meta) notFound();
	return (
		<Workbook
			id={meta.id}
			name={meta.name}
			googleSpreadsheetId={meta.googleSpreadsheetId}
		/>
	);
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	// getUser (not requireUser): metadata must never trigger the redirect —
	// the page body owns that. No session means no title, not a crash.
	const user = await getUser();
	if (!user) return { title: "Workbook" };
	const { id } = await params;
	const meta = await loadWorkbook(id, user.id);
	return { title: meta?.name ?? "Workbook" };
}

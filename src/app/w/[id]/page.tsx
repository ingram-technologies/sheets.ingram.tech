import { notFound } from "next/navigation";

import { Workbook } from "@/components/workbook/Workbook";
import { requireUser } from "@/lib/session";
import { getWorkbookMeta } from "@/lib/workbooks";

export const dynamic = "force-dynamic";

export default async function WorkbookPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	await requireUser();
	const { id } = await params;
	const meta = await getWorkbookMeta(id);
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
	const { id } = await params;
	const meta = await getWorkbookMeta(id);
	return { title: meta?.name ?? "Workbook" };
}

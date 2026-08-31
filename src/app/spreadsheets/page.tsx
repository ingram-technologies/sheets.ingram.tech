import { FileManager } from "@/components/files/FileManager";
import { inferenceView } from "@/lib/inference-view";
import { requireUser } from "@/lib/session";
import { listWorkbooks } from "@/lib/workbooks";

export const dynamic = "force-dynamic";

export const metadata = { title: "Spreadsheets" };

export default async function SpreadsheetsPage() {
	const user = await requireUser();
	const [workbooks, inference] = await Promise.all([
		listWorkbooks(user.id),
		inferenceView(user.id, "/spreadsheets"),
	]);
	return <FileManager workbooks={workbooks} inference={inference} />;
}

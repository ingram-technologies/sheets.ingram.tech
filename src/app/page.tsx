import { FileManager } from "@/components/files/FileManager";
import { requireUser } from "@/lib/session";
import { listWorkbooks } from "@/lib/workbooks";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	await requireUser();
	const workbooks = await listWorkbooks();
	return <FileManager workbooks={workbooks} />;
}

import { FileManager } from "@/components/files/FileManager";
import { requireUser } from "@/lib/session";
import { listWorkbooks } from "@/lib/workbooks";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	const user = await requireUser();
	const workbooks = await listWorkbooks(user.id);
	return <FileManager workbooks={workbooks} />;
}

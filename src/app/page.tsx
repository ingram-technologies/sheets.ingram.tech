import { FileManager } from "@/components/files/FileManager";
import { listWorkbooks } from "@/lib/workbooks";

export const dynamic = "force-dynamic";

export default async function HomePage() {
	const workbooks = await listWorkbooks();
	return <FileManager workbooks={workbooks} />;
}

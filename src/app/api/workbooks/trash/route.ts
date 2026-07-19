import { requireApiUser } from "@/lib/session";
import { listDeletedWorkbooks } from "@/lib/workbooks";

// The owner's trashed workbooks. Scoped by session user id like every other
// workbook read — someone else's trash is invisible, not forbidden.
export async function GET() {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const workbooks = await listDeletedWorkbooks(gate.userId);
	return Response.json({ workbooks });
}

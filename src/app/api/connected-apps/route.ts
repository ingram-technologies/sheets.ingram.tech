import { listConnectedApps } from "@/lib/connected-apps";
import { requireApiUser } from "@/lib/session";

// The apps the signed-in user has allowed into their workbooks over MCP.
export async function GET() {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const apps = await listConnectedApps(gate.userId);
	return Response.json({ apps });
}

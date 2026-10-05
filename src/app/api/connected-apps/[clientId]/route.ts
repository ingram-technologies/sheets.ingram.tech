import { disconnectApp } from "@/lib/connected-apps";
import { requireApiUser } from "@/lib/session";

type Params = { params: Promise<{ clientId: string }> };

// Disconnect: the consent and every token the app holds for this user go at
// once. Scoped by the session user, so another user's app answers 404.
export async function DELETE(_request: Request, { params }: Params) {
	const gate = await requireApiUser();
	if ("response" in gate) return gate.response;
	const { clientId } = await params;
	const removed = await disconnectApp(gate.userId, clientId);
	if (!removed) return Response.json({ error: "not found" }, { status: 404 });
	return new Response(null, { status: 204 });
}

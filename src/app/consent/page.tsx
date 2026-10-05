import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

import { ConsentForm, ConsentProblem } from "./consent-form";

export const metadata = { title: "Allow access" };

/**
 * Where an MCP client's authorization stops to ask the user. Better Auth sends
 * the browser here with the authorization request as a signed query; nothing
 * on it is trusted until that signature checks out, and the client's name
 * comes from its registration, not from the URL.
 */
export default async function ConsentPage({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
	const user = await requireUser();

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(await searchParams)) {
		for (const item of Array.isArray(value) ? value : [value]) {
			if (item !== undefined) params.append(key, item);
		}
	}
	const { secret } = await auth.$context;
	const clientId = params.get("client_id");
	if (!clientId || !(await verifyOAuthQueryParams(params.toString(), secret))) {
		return <ConsentProblem />;
	}

	const client = await auth.api
		.getOAuthClientPublic({
			query: { client_id: clientId },
			headers: await headers(),
		})
		.catch(() => null);
	if (!client) return <ConsentProblem />;

	return (
		<ConsentForm
			clientName={client.client_name ?? "An application"}
			clientUri={client.client_uri ?? null}
			email={user.email}
			staysConnected={(params.get("scope") ?? "")
				.split(" ")
				.includes("offline_access")}
		/>
	);
}

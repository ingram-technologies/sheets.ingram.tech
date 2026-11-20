import { authUserId } from "@ingram-tech/nk-auth";
import { z } from "zod";

import { pool } from "./db";
import { ids } from "./ids";

/**
 * The programs a user has let into their workbooks over MCP, and the way to
 * throw one out.
 *
 * An app is "connected" while the user's consent for it exists. Better Auth
 * keeps the grant in its own tables (nk-auth's chain, outside the drizzle
 * schema), so this reads them with plain SQL, and every query takes the
 * owner like lib/workbooks does: someone else's app is simply not found.
 * Those tables key users by Better Auth's raw id, so the owner (`usr_…`) is
 * bound through `authUserId`.
 *
 * Disconnecting has to do more than Better Auth's own `delete-consent`, which
 * removes the consent and leaves the client's refresh token working, so the
 * app would quietly mint itself new access tokens. Here the consent and every
 * token the app holds for this user go together. Access tokens are JWTs
 * checked against our keys alone, so deleting their rows would not stop one
 * already issued; /api/mcp therefore also asks `hasConsent` on each call,
 * which is what makes a disconnect take effect on the app's next request.
 */

export const connectedAppSchema = z.object({
	clientId: z.string(),
	name: z.string().nullable(),
	uri: z.string().nullable(),
	connectedAt: z.iso.datetime(),
	/** When the app last got a fresh token (sign-in or refresh); null if it
	 *  never has since it was allowed. */
	lastActiveAt: z.iso.datetime().nullable(),
});

export type ConnectedApp = z.infer<typeof connectedAppSchema>;

const rowSchema = z.object({
	clientId: z.string(),
	name: z.string().nullable(),
	uri: z.string().nullable(),
	connectedAt: z.date(),
	lastActiveAt: z.date().nullable(),
});

export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
	const { rows } = await pool.query(
		`select c."clientId",
		        cl.name,
		        cl.uri,
		        min(c."createdAt") as "connectedAt",
		        (select max(t."createdAt") from "oauthRefreshToken" t
		          where t."userId" = $1 and t."clientId" = c."clientId") as "lastActiveAt"
		   from "oauthConsent" c
		   join "oauthClient" cl on cl."clientId" = c."clientId"
		  where c."userId" = $1
		  group by c."clientId", cl.name, cl.uri
		  order by "connectedAt" desc`,
		[authUserId(userId, ids)],
	);
	return z
		.array(rowSchema)
		.parse(rows)
		.map((row) => ({
			...row,
			connectedAt: row.connectedAt.toISOString(),
			lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
		}));
}

/** False when there was nothing of this user's to disconnect. */
export async function disconnectApp(
	userId: string,
	clientId: string,
): Promise<boolean> {
	const client = await pool.connect();
	try {
		await client.query("begin");
		const consents = await client.query(
			`delete from "oauthConsent" where "userId" = $1 and "clientId" = $2`,
			[authUserId(userId, ids), clientId],
		);
		// Access tokens first: they reference the refresh token they came from.
		await client.query(
			`delete from "oauthAccessToken" where "userId" = $1 and "clientId" = $2`,
			[authUserId(userId, ids), clientId],
		);
		await client.query(
			`delete from "oauthRefreshToken" where "userId" = $1 and "clientId" = $2`,
			[authUserId(userId, ids), clientId],
		);
		await client.query("commit");
		return (consents.rowCount ?? 0) > 0;
	} catch (error) {
		await client.query("rollback");
		throw error;
	} finally {
		client.release();
	}
}

/** Whether this user still allows this app. Asked on every MCP call. */
export async function hasConsent(userId: string, clientId: string): Promise<boolean> {
	const { rowCount } = await pool.query(
		`select 1 from "oauthConsent" where "userId" = $1 and "clientId" = $2 limit 1`,
		[authUserId(userId, ids), clientId],
	);
	return (rowCount ?? 0) > 0;
}

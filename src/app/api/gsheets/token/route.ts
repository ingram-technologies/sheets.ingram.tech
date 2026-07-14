import { getGoogleToken, gsheetsErrorResponse } from "@/lib/gsheets";
import { DRIVE_FILE_SCOPE } from "@/lib/gsheets-transfer";
import { getSession } from "@/lib/session";

/**
 * Hand the signed-in user their own Google access token so the browser can
 * open the Google Picker (its JS runs client-side and needs the token).
 * Requires the drive.file grant — that's the scope the Picker operates
 * under, and picking a file records the per-file access this app then uses.
 */
export async function GET() {
	const session = await getSession();
	if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
	try {
		const { accessToken } = await getGoogleToken(session.user.id, [
			DRIVE_FILE_SCOPE,
		]);
		return new Response(JSON.stringify({ accessToken }), {
			headers: {
				"content-type": "application/json",
				"cache-control": "no-store",
			},
		});
	} catch (error) {
		return gsheetsErrorResponse(error);
	}
}

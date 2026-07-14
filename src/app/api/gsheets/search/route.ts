import {
	getGoogleToken,
	gsheetsErrorResponse,
	searchSpreadsheets,
} from "@/lib/gsheets";
import { DRIVE_FILE_SCOPE } from "@/lib/gsheets-transfer";
import { getSession } from "@/lib/session";

/**
 * Search the user's spreadsheets reachable under the `drive.file` grant
 * (created by this app or picked via the Google Picker). `?q=` filters by
 * name; empty returns the most recently modified.
 */
export async function GET(request: Request) {
	const session = await getSession();
	if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
	const query = new URL(request.url).searchParams.get("q") ?? "";
	try {
		const { accessToken } = await getGoogleToken(session.user.id, [
			DRIVE_FILE_SCOPE,
		]);
		return Response.json({ files: await searchSpreadsheets(accessToken, query) });
	} catch (error) {
		return gsheetsErrorResponse(error);
	}
}

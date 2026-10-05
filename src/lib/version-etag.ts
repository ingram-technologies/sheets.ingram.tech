/**
 * A workbook version carried as an HTTP ETag, which is how the browser's
 * autosave proves it is writing on top of what it read (see the bytes route).
 *
 * The server sends a strong tag, `"3"`, but Vercel compresses the response on
 * the way out and marks the tag weak, `W/"3"`, because the bytes on the wire
 * are no longer the bytes it was given. The version is still the version, so
 * both forms parse. Rejecting the weak one left the client with no version,
 * every save went out without `If-Match`, and the server refused them all.
 */

/** The version as a strong ETag: 3 -> `"3"`. */
export function versionEtag(version: number): string {
	return `"${version}"`;
}

/** `"3"` or `W/"3"` -> 3. Null when absent, `*`, or not a version tag. */
export function parseVersionEtag(header: string | null): number | null {
	if (!header) return null;
	const match = /^(?:W\/)?"(\d+)"$/.exec(header.trim());
	if (!match?.[1]) return null;
	return Number(match[1]);
}

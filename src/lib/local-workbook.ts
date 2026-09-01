/**
 * The scratch workbook: a sheet with no account behind it.
 *
 * Signed in, a workbook is rows in our Postgres. Signed out, it is these bytes
 * in this browser and nowhere else — which is the whole point of the mode. The
 * engine already runs in the tab, so an account was only ever buying
 * persistence; localStorage buys enough of it to survive a reload.
 *
 * Every entry point answers rather than throws. Private windows, cleared site
 * data and browsers that refuse storage all reach here, and none of them is a
 * reason to lose the grid the person is looking at.
 */

const KEY = "ingram-sheets.scratch.v1";

/** Roughly 3 MB of base64. Past that localStorage starts refusing writes, and
 *  a workbook that large wants a real account anyway. */
const MAX_CHARS = 3_000_000;

export function loadScratchBytes(): Uint8Array | null {
	try {
		const encoded = window.localStorage.getItem(KEY);
		if (!encoded) return null;
		const binary = window.atob(encoded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
		return bytes;
	} catch {
		return null;
	}
}

/** Answers whether the bytes were kept, so the caller can tell the truth in
 *  the save indicator rather than claiming a save that did not happen. */
export function saveScratchBytes(bytes: Uint8Array): boolean {
	try {
		let binary = "";
		for (const byte of bytes) binary += String.fromCharCode(byte);
		const encoded = window.btoa(binary);
		if (encoded.length > MAX_CHARS) return false;
		window.localStorage.setItem(KEY, encoded);
		return true;
	} catch {
		return false;
	}
}

export function clearScratch(): void {
	try {
		window.localStorage.removeItem(KEY);
	} catch {
		// Nothing stored means nothing to clear.
	}
}

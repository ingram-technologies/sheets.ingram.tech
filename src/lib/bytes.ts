/** Encode engine bytes for the JSON create-workbook body (browser-safe). */
export function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

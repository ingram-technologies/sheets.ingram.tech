/**
 * At-rest encryption for credentials the server must be able to REPLAY — a
 * user's Ingram Cloud project token, which every chat turn presents to IC.
 *
 * AES-256-GCM under a key derived from `SHEETS_CREDENTIALS_KEY` (any string of
 * ≥ 32 chars; the key is its sha256). One env var, no key ids: rotating it
 * means every user re-links, which is one click. Ciphertext is self-describing
 * (`v1.<iv>.<tag>.<ct>`, base64url) so a future scheme can coexist. The
 * plaintext never touches a log or a row. Same scheme as depot's.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const VERSION = "v1";
const MIN_SECRET_CHARS = 32;

function key(): Buffer {
	const secret = process.env.SHEETS_CREDENTIALS_KEY;
	if (!secret || secret.length < MIN_SECRET_CHARS) {
		throw new Error(
			`SHEETS_CREDENTIALS_KEY must be set to a string of at least ${MIN_SECRET_CHARS} characters.`,
		);
	}
	return createHash("sha256").update(secret, "utf8").digest();
}

/** True when the app can encrypt/decrypt credentials at all. */
export function credentialsKeyConfigured(): boolean {
	const secret = process.env.SHEETS_CREDENTIALS_KEY;
	return Boolean(secret && secret.length >= MIN_SECRET_CHARS);
}

export function encryptSecret(plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv(ALGO, key(), iv);
	const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [
		VERSION,
		iv.toString("base64url"),
		tag.toString("base64url"),
		ct.toString("base64url"),
	].join(".");
}

export function decryptSecret(sealed: string): string {
	const [version, ivB64, tagB64, ctB64] = sealed.split(".");
	if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) {
		throw new Error("Unrecognized sealed-secret format.");
	}
	const decipher = createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64url"));
	decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
	return Buffer.concat([
		decipher.update(Buffer.from(ctB64, "base64url")),
		decipher.final(),
	]).toString("utf8");
}

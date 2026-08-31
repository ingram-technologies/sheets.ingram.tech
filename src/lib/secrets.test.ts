import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { credentialsKeyConfigured, decryptSecret, encryptSecret } from "./secrets";

beforeEach(() => {
	process.env.SHEETS_CREDENTIALS_KEY = "s".repeat(40);
});
afterEach(() => {
	delete process.env.SHEETS_CREDENTIALS_KEY;
});

describe("sealed secrets", () => {
	it("round-trips, and never stores the plaintext", () => {
		const sealed = encryptSecret("tha_live_secret");
		expect(sealed.startsWith("v1.")).toBe(true);
		expect(sealed).not.toContain("tha_live");
		expect(decryptSecret(sealed)).toBe("tha_live_secret");
	});

	it("uses a fresh iv per seal", () => {
		expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
	});

	it("refuses a tampered ciphertext and a rotated key", () => {
		const sealed = encryptSecret("tha_live_secret");
		expect(() => decryptSecret(`${sealed.slice(0, -2)}AA`)).toThrow();
		process.env.SHEETS_CREDENTIALS_KEY = "t".repeat(40);
		expect(() => decryptSecret(sealed)).toThrow();
	});

	it("requires a long enough key", () => {
		process.env.SHEETS_CREDENTIALS_KEY = "short";
		expect(credentialsKeyConfigured()).toBe(false);
		expect(() => encryptSecret("x")).toThrow(/SHEETS_CREDENTIALS_KEY/);
	});
});

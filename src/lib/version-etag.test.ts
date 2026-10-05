import { describe, expect, it } from "vitest";

import { parseVersionEtag, versionEtag } from "./version-etag";

describe("version ETags", () => {
	it("round-trips a version", () => {
		expect(parseVersionEtag(versionEtag(42))).toBe(42);
	});

	it("reads the weak tag a compressing CDN turns it into", () => {
		expect(parseVersionEtag('W/"7"')).toBe(7);
	});

	it("refuses anything that is not a version", () => {
		for (const header of [null, "", "*", '"abc"', "7", 'w/"7"', '"7", "8"']) {
			expect(parseVersionEtag(header)).toBeNull();
		}
	});
});

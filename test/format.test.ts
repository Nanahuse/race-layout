import {describe, expect, it} from "vitest";
import {formatElapsed, formatRaceStatus} from "../src/extension/format";

describe("formatElapsed", () => {
	it("formats hours with one decimal place", () => {
		expect(formatElapsed("PT1H2M3.45S", 1)).toBe("1:02:03.5");
	});

	it("formats minutes and milliseconds", () => {
		expect(formatElapsed("PT83.456S", 3)).toBe("1:23.456");
	});

	it("carries rounded values", () => {
		expect(formatElapsed("PT59.9996S", 3)).toBe("1:00.000");
	});

	it("keeps a null value null", () => {
		expect(formatElapsed(null, 1)).toBeNull();
	});

	it("returns null for invalid durations", () => {
		expect(formatElapsed("not-a-duration", 1)).toBeNull();
	});
});

describe("formatRaceStatus", () => {
	it("formats RaceTime statuses", () => {
		expect(formatRaceStatus("in_progress")).toBe("IN PROGRESS");
		expect(formatRaceStatus(null)).toBe("NO RACE");
	});
});

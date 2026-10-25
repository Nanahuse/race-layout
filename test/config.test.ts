import {describe, expect, it} from "vitest";
import {
	broadcastConfigsEqual,
	normalizeRaceUrl,
	parseBroadcastConfig,
	validateBroadcastConfigDraft,
} from "../src/shared/config";
import {createDefaultBroadcastConfig} from "../src/shared/defaults";

const draft = () => {
	const {revision: _revision, ...rest} = createDefaultBroadcastConfig();
	return rest;
};

describe("broadcast config", () => {
	it("accepts the default configuration", () => {
		expect(validateBroadcastConfigDraft(draft())).toEqual(draft());
	});

	it("requires six slots", () => {
		expect(() =>
			validateBroadcastConfigDraft({...draft(), slots: [null]}),
		).toThrow(/exactly 6/);
	});

	it("rejects duplicate slot assignments", () => {
		expect(() =>
			validateBroadcastConfigDraft({
				...draft(),
				slots: ["user-1", "user-1", null, null, null, null],
			}),
		).toThrow(/only be placed once/);
	});

	it("rejects race URLs with credentials", () => {
		expect(() => normalizeRaceUrl("https://user:pass@racetime.gg/a/b")).toThrow(
			/credentials/,
		);
	});

	it("rejects non-http race URLs", () => {
		expect(() => normalizeRaceUrl("ftp://racetime.gg/a/b")).toThrow(/http/);
	});

	it("normalizes whitespace when comparing drafts", () => {
		const left = {
			...draft(),
			eventName: "  Event  ",
			commentatorIds: [" player-1 ", "", "player-1"],
		};
		const right = {
			...draft(),
			eventName: "Event",
			commentatorIds: ["player-1"],
		};
		expect(broadcastConfigsEqual(left, right)).toBe(true);
	});

	it("keeps the persisted revision", () => {
		const config = parseBroadcastConfig({
			...draft(),
			revision: 12,
		});
		expect(config.revision).toBe(12);
	});
});

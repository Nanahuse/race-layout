import type {
	Race,
	ResolvedCategoryMapping,
	SpeedrunLeaderboard,
} from "@nanahuse/racetime-protocol";
import {describe, expect, it} from "vitest";
import type {RaceTimeGateway} from "../src/extension/integrations/racetime-gateway";
import {RecordsCoordinator} from "../src/extension/records-coordinator";

const mapping = (key: string): ResolvedCategoryMapping => ({
	key,
	label: `Mapping ${key}`,
	game: {gameId: "game-1", gameName: "Game"},
	category: {
		categoryId: "category-1",
		categoryName: "Any%",
		levelId: null,
		variables: {},
		platformId: null,
		regionId: null,
		emulator: null,
		timingMethod: null,
	},
});

const race = (raceId: string, slug: string): Race => ({
	raceId,
	url: `https://racetime.gg/${slug}/${raceId}`,
	version: 1,
	name: raceId,
	status: "in_progress",
	openedAt: "2026-01-01T00:00:00Z",
	startedAt: "2026-01-01T00:01:00Z",
	endedAt: null,
	cancelledAt: null,
	startDelay: "PT1M",
	timeLimit: "PT1H",
	info: "",
	ranked: true,
	recordable: true,
	recorded: false,
	timeLimitAutoComplete: true,
	entrantsCount: 1,
	entrantsCountFinished: 0,
	entrantsCountInactive: 0,
	category: {slug, name: "Any%", goal: "Beat the game"},
	entrants: [
		{
			userId: "rt-1",
			name: "Runner",
			twitchLogin: null,
			status: "in_progress",
			finishTime: null,
			finishedAt: null,
			place: null,
		},
	],
	results: [],
});

const leaderboard = (
	activeMapping: ResolvedCategoryMapping,
	time: string,
): SpeedrunLeaderboard => ({
	mapping: activeMapping,
	top: 20,
	fetchedAt: "2026-01-01T00:00:00Z",
	state: "ready",
	entries: [
		{
			place: 1,
			run: {
				runId: `${activeMapping.key}-run`,
				url: "https://speedrun.com/run",
				time,
				date: "2025-01-01",
				players: [
					{
						userId: "src-1",
						name: "Runner",
						url: "https://speedrun.com/user",
					},
				],
			},
		},
	],
	stale: false,
});

type Deferred<T> = {
	promise: Promise<T>;
	resolve: (value: T) => void;
};

const deferred = <T>(): Deferred<T> => {
	let resolve: (value: T) => void = () => {};
	const promise = new Promise<T>((next) => {
		resolve = next;
	});
	return {promise, resolve};
};

type LeaderboardResponse = {
	status: "resolved";
	mappings: ResolvedCategoryMapping[];
	leaderboards: SpeedrunLeaderboard[];
};

class FakeGateway {
	resolveCalls = 0;
	leaderboardCalls = 0;
	bestsCalls = 0;
	mappingBySlug = new Map<string, ResolvedCategoryMapping[]>();
	leaderboardQueues = new Map<string, Deferred<LeaderboardResponse>>();
	leaderboardError: Error | null = null;
	bestsError: Error | null = null;

	async resolveCategoryMapping(slug: string) {
		this.resolveCalls++;
		return {
			status: "resolved" as const,
			mappings: this.mappingBySlug.get(slug) ?? [],
		};
	}

	async getSpeedrunLeaderboards(slug: string) {
		this.leaderboardCalls++;
		if (this.leaderboardError) throw this.leaderboardError;
		const activeMapping = this.mappingBySlug.get(slug)?.[0];
		if (!activeMapping) return {status: "unregistered" as const};
		const queued = this.leaderboardQueues.get(slug);
		if (queued) return queued.promise;
		return {
			status: "resolved" as const,
			mappings: [activeMapping],
			leaderboards: [leaderboard(activeMapping, "PT50S")],
		};
	}

	async getSpeedrunPlayerBests(slug: string) {
		this.bestsCalls++;
		if (this.bestsError) throw this.bestsError;
		return {
			status: "resolved" as const,
			mappings: this.mappingBySlug.get(slug) ?? [],
			results: [],
		};
	}
}

const flush = async () => {
	for (let index = 0; index < 8; index++)
		await new Promise((resolve) => setTimeout(resolve, 0));
};

describe("RecordsCoordinator", () => {
	it("does not fetch again when the context signature is unchanged", async () => {
		const gateway = new FakeGateway();
		const active = mapping("a");
		gateway.mappingBySlug.set("slug-a", [active]);
		const coordinator = new RecordsCoordinator(
			gateway as unknown as RaceTimeGateway,
			() => {},
		);
		const context = {
			race: race("race-a", "slug-a"),
			playerIds: ["player-1"],
			mappingKey: active.key,
		};
		coordinator.request(context);
		await flush();
		expect(gateway.resolveCalls).toBe(1);
		coordinator.request(context);
		await flush();
		expect(gateway.resolveCalls).toBe(1);
		expect(coordinator.getSnapshot().status.state).toBe("ready");
	});

	it("keeps a successful leaderboard when PB retrieval fails", async () => {
		const gateway = new FakeGateway();
		const active = mapping("a");
		gateway.mappingBySlug.set("slug-a", [active]);
		gateway.bestsError = new Error("PB lookup failed");
		const coordinator = new RecordsCoordinator(
			gateway as unknown as RaceTimeGateway,
			() => {},
		);
		coordinator.request({
			race: race("race-a", "slug-a"),
			playerIds: ["player-1"],
			mappingKey: active.key,
		});
		await flush();
		const snapshot = coordinator.getSnapshot();
		expect(snapshot.leaderboard?.entries).toHaveLength(1);
		expect(snapshot.bests.size).toBe(0);
		expect(snapshot.status.state).toBe("ready");
		expect(snapshot.status.message).toContain("PB lookup failed");
	});

	it("does not silently switch when the selected mapping is missing", async () => {
		const gateway = new FakeGateway();
		gateway.mappingBySlug.set("slug-a", [mapping("a"), mapping("b")]);
		const coordinator = new RecordsCoordinator(
			gateway as unknown as RaceTimeGateway,
			() => {},
		);
		coordinator.request({
			race: race("race-a", "slug-a"),
			playerIds: ["player-1"],
			mappingKey: "missing",
		});
		await flush();
		const snapshot = coordinator.getSnapshot();
		expect(snapshot.activeMapping).toBeNull();
		expect(snapshot.status.state).toBe("error");
		expect(snapshot.status.message).toMatch(/自動で切り替えません/);
		expect(gateway.leaderboardCalls).toBe(0);
	});

	it("uses the sole mapping automatically when no key is selected", async () => {
		const gateway = new FakeGateway();
		const active = mapping("a");
		gateway.mappingBySlug.set("slug-a", [active]);
		const coordinator = new RecordsCoordinator(
			gateway as unknown as RaceTimeGateway,
			() => {},
		);
		coordinator.request({
			race: race("race-a", "slug-a"),
			playerIds: ["player-1"],
			mappingKey: null,
		});
		await flush();
		expect(coordinator.getSnapshot().status.effectiveMappingKey).toBe("a");
	});

	it("discards responses belonging to a previous race", async () => {
		const gateway = new FakeGateway();
		const first = mapping("first");
		const second = mapping("second");
		gateway.mappingBySlug.set("slug-a", [first]);
		gateway.mappingBySlug.set("slug-b", [second]);
		const firstQueue = deferred<LeaderboardResponse>();
		const secondQueue = deferred<LeaderboardResponse>();
		gateway.leaderboardQueues.set("slug-a", firstQueue);
		gateway.leaderboardQueues.set("slug-b", secondQueue);
		const coordinator = new RecordsCoordinator(
			gateway as unknown as RaceTimeGateway,
			() => {},
		);

		coordinator.request({
			race: race("race-a", "slug-a"),
			playerIds: ["player-1"],
			mappingKey: first.key,
		});
		await flush();
		coordinator.request({
			race: race("race-b", "slug-b"),
			playerIds: ["player-1"],
			mappingKey: second.key,
		});
		await flush();

		secondQueue.resolve({
			status: "resolved",
			mappings: [second],
			leaderboards: [leaderboard(second, "PT40S")],
		});
		await flush();
		firstQueue.resolve({
			status: "resolved",
			mappings: [first],
			leaderboards: [leaderboard(first, "PT30S")],
		});
		await flush();

		const snapshot = coordinator.getSnapshot();
		expect(snapshot.activeMapping?.key).toBe("second");
		expect(snapshot.leaderboard?.mapping.key).toBe("second");
		expect(snapshot.leaderboard?.entries[0]?.run.time).toBe("PT40S");
	});
});

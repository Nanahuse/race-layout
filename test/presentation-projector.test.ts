import type {Player} from "@nanahuse/player-manager-protocol";
import type {
	Participant,
	Race,
	RaceState,
	ResolvedCategoryMapping,
	SpeedrunLeaderboard,
	SpeedrunPlayerBest,
} from "@nanahuse/racetime-protocol";
import {describe, expect, it} from "vitest";
import {PresentationProjector} from "../src/extension/presentation-projector";
import type {RecordsSnapshot} from "../src/extension/records-coordinator";
import {createDefaultBroadcastConfig} from "../src/shared/defaults";

const mapping: ResolvedCategoryMapping = {
	key: "mapping-1",
	label: "Any% (No Loads)",
	game: {gameId: "game-1", gameName: "Test Game"},
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
};

const race: Race = {
	raceId: "test-game/race-1",
	url: "https://racetime.gg/test-game/race-1",
	version: 3,
	name: "Test Race",
	status: "in_progress",
	openedAt: "2026-01-01T00:00:00Z",
	startedAt: "2026-01-01T00:01:00Z",
	endedAt: null,
	cancelledAt: null,
	startDelay: "PT1M",
	timeLimit: "PT2H",
	info: "",
	ranked: true,
	recordable: true,
	recorded: false,
	timeLimitAutoComplete: true,
	entrantsCount: 2,
	entrantsCountFinished: 1,
	entrantsCountInactive: 1,
	category: {slug: "test-game", name: "Any%", goal: "Beat the game"},
	entrants: [
		{
			userId: "rt-1",
			name: "RaceTime One",
			twitchLogin: "one",
			status: "done",
			finishTime: "PT83.44S",
			finishedAt: "2026-01-01T00:02:23.44Z",
			place: 1,
		},
		{
			userId: "rt-2",
			name: "RaceTime Two",
			twitchLogin: null,
			status: "dnf",
			finishTime: null,
			finishedAt: null,
			place: null,
		},
	],
	results: [
		{
			userId: "rt-1",
			name: "RaceTime One",
			place: 1,
			time: "PT83.44S",
			finishedAt: "2026-01-01T00:02:23.44Z",
			status: "finished",
		},
		{
			userId: "rt-2",
			name: "RaceTime Two",
			place: null,
			time: null,
			finishedAt: null,
			status: "dnf",
		},
	],
};

const participants: Participant[] = [
	{
		racetimeUserId: "rt-1",
		status: "matched",
		playerId: "player-1",
		player: {
			playerId: "player-1",
			revision: 1,
			displayName: "RaceTime One",
			racetime: {userId: "rt-1", name: "RaceTime One"},
			speedrunCom: {userId: "src-1", name: "SRC One"},
			twitch: {userId: null, login: "one", displayName: "One"},
			youtube: "https://youtube.com/@one",
		},
		message: "",
	},
	{
		racetimeUserId: "rt-2",
		status: "matched",
		playerId: "player-2",
		player: {
			playerId: "player-2",
			revision: 1,
			displayName: "RaceTime Two",
			racetime: {userId: "rt-2", name: "RaceTime Two"},
			speedrunCom: null,
			twitch: null,
			youtube: null,
		},
		message: "",
	},
];

const raceState: RaceState = {
	revision: 1,
	raceRevision: 3,
	participantsRevision: 1,
	resolution: {
		state: "ready",
		raceRevision: 3,
		directoryRevision: 1,
	},
	url: race.url,
	race,
	connection: "connected",
	error: null,
	participants,
};

const players = new Map<string, Player>([
	[
		"player-1",
		{
			playerId: "player-1",
			revision: 1,
			manualDisplayName: "PM One",
			racetime: {userId: "rt-1", name: "RaceTime One"},
			speedrunCom: {userId: "src-1", name: "SRC One"},
			twitch: {login: "one", displayName: "One"},
			youtube: "https://youtube.com/@one",
			accounts: [],
		},
	],
]);

const best: SpeedrunPlayerBest = {
	playerId: "player-1",
	srcUserId: "src-1",
	state: "found",
	run: {
		runId: "run-1",
		url: "https://speedrun.com/run/1",
		time: "PT1M",
		date: "2025-12-01",
		players: [
			{
				userId: "src-1",
				name: "SRC One",
				url: "https://speedrun.com/user/src-1",
				displayName: "Display One",
			},
		],
		place: 2,
		gameId: "game-1",
		categoryId: "category-1",
		levelId: null,
		variables: {},
	},
	place: 2,
	fetchedAt: "2026-01-01T00:00:00Z",
	stale: false,
};

const leaderboard: SpeedrunLeaderboard = {
	mapping,
	top: 20,
	fetchedAt: "2026-01-01T00:00:00Z",
	state: "ready",
	entries: [
		{
			place: 1,
			run: {
				runId: "run-2",
				url: "https://speedrun.com/run/2",
				time: "PT50S",
				date: "2025-11-01",
				players: [
					{
						userId: "src-2",
						name: "SRC Two",
						url: "https://speedrun.com/user/src-2",
						displayName: "Display Two",
					},
					{
						userId: "src-3",
						name: "SRC Three",
						url: "https://speedrun.com/user/src-3",
					},
				],
			},
		},
		{
			place: 2,
			run: {
				runId: "run-1",
				url: "https://speedrun.com/run/1",
				time: "PT1M",
				date: "2025-12-01",
				players: [
					{
						userId: "src-1",
						name: "SRC One",
						url: "https://speedrun.com/user/src-1",
						displayName: "Display One",
					},
				],
			},
		},
	],
	stale: false,
};

const records: RecordsSnapshot = {
	mappings: [mapping],
	activeMapping: mapping,
	leaderboard,
	bests: new Map([["player-1", best]]),
	fetchedAt: "2026-01-01T00:00:00Z",
	stale: false,
	status: {
		state: "ready",
		message: null,
		selectedMappingKey: "mapping-1",
		effectiveMappingKey: "mapping-1",
		mappingLabel: "Any% (No Loads)",
		fetchedAt: "2026-01-01T00:00:00Z",
		stale: false,
	},
};

const projectWithState = (state: RaceState) => {
	const config = createDefaultBroadcastConfig();
	config.slots = ["rt-1", "rt-2", null, null, null, null];
	config.commentatorIds = ["player-1"];
	return new PresentationProjector().project(
		{
			config,
			raceState: state,
			records,
			getPlayer: (playerId) => players.get(playerId),
		},
		1,
		"2026-01-01T00:00:00Z",
	);
};

const project = () => projectWithState(raceState);

describe("PresentationProjector", () => {
	it("prefers Player Manager display names and builds player bars", () => {
		const projection = project();
		expect(projection.race.players).toHaveLength(6);
		expect(projection.race.players[0]).toMatchObject({
			name: "PM One",
			twitch: "twitch.tv/one",
			youtube: "youtube.com/@one",
			pb: {time: "1:00.000", place: 2},
			result: {place: 1, time: "1:23.4", status: "finished"},
		});
		expect(projection.race.players[1]).toMatchObject({
			name: "RaceTime Two",
			result: {place: null, time: null, status: "dnf"},
		});
		expect(projection.race.players[2]).toBeNull();
	});

	it("builds the common information panel", () => {
		const {info} = project().race;
		expect(info.eventName).toBe("Test Race");
		expect(info.categoryName).toBe("Any%");
		expect(info.raceStatus).toBe("IN PROGRESS");
		expect(info.commentators).toEqual(["PM One"]);
		expect(info.record).toEqual({
			label: "TOP RECORD",
			time: "0:50.000",
			holder: "Display Two & SRC Three",
		});
	});

	it("ignores participant resolution from an older race revision", () => {
		const projection = projectWithState({
			...raceState,
			raceRevision: raceState.raceRevision + 1,
		});
		expect(projection.race.players[0]).toMatchObject({
			name: "RaceTime One",
			pb: null,
			twitch: null,
			youtube: null,
		});
		expect(projection.participants.participants[0]?.name).toBe("RaceTime One");
	});

	it("lists every participant and preserves SRC places", () => {
		const projection = project();
		expect(projection.participants.participants.map((p) => p.userId)).toEqual([
			"rt-1",
			"rt-2",
		]);
		expect(projection.participants.participants[0]?.pb).toEqual({
			time: "1:00.000",
			place: 2,
		});
		expect(projection.leaderboard.entries).toEqual([
			{place: 1, time: "0:50.000", players: ["Display Two", "SRC Three"]},
			{place: 2, time: "1:00.000", players: ["Display One"]},
		]);
	});

	it("orders finished results before DNF results", () => {
		expect(project().result.results).toEqual([
			{
				userId: "rt-1",
				name: "PM One",
				place: 1,
				time: "1:23.4",
				status: "finished",
			},
			{
				userId: "rt-2",
				name: "RaceTime Two",
				place: null,
				time: null,
				status: "dnf",
			},
		]);
	});
});

import {
	type BroadcastConfig,
	type BroadcastStatus,
	type LeaderboardPresentation,
	type ParticipantsPresentation,
	type RacePresentation,
	type ResultPresentation,
	SLOT_COUNT,
} from "./types";

export const createDefaultBroadcastConfig = (): BroadcastConfig => ({
	revision: 0,
	raceUrl: null,
	slots: Array.from({length: SLOT_COUNT}, () => null),
	eventName: "",
	categoryName: "",
	commentators: [],
	mappingKey: null,
});

export const createEmptyRacePresentation = (): RacePresentation => ({
	revision: 0,
	updatedAt: new Date(0).toISOString(),
	raceUrl: null,
	raceId: null,
	raceName: "",
	players: Array.from({length: SLOT_COUNT}, () => null),
	info: {
		eventName: "",
		categoryName: "",
		commentators: [],
		raceStatus: "NO RACE",
		record: null,
	},
});

export const createEmptyParticipantsPresentation =
	(): ParticipantsPresentation => ({
		revision: 0,
		updatedAt: new Date(0).toISOString(),
		raceName: "",
		categoryName: "",
		raceStatus: "NO RACE",
		participants: [],
	});

export const createEmptyLeaderboardPresentation =
	(): LeaderboardPresentation => ({
		revision: 0,
		updatedAt: new Date(0).toISOString(),
		mappingLabel: "",
		gameName: "",
		categoryName: "",
		status: "unavailable",
		message: null,
		entries: [],
	});

export const createEmptyResultPresentation = (): ResultPresentation => ({
	revision: 0,
	updatedAt: new Date(0).toISOString(),
	raceName: "",
	categoryName: "",
	raceStatus: "NO RACE",
	results: [],
});

export const createDefaultBroadcastStatus = (): BroadcastStatus => ({
	revision: 0,
	updatedAt: new Date(0).toISOString(),
	race: {
		state: "idle",
		url: null,
		watchId: null,
		connection: null,
		raceId: null,
		message: null,
	},
	playerManager: {state: "idle", message: null},
	speedrun: {
		state: "idle",
		message: null,
		selectedMappingKey: null,
		effectiveMappingKey: null,
		mappingLabel: null,
		fetchedAt: null,
		stale: false,
	},
	mappings: [],
	races: [],
});

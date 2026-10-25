export const SLOT_COUNT = 6;
export const RACE_4_SLOT_COUNT = 4;

export type ResultStatus = "finished" | "dnf" | "dq" | "other";

export type BroadcastConfig = {
	revision: number;
	raceUrl: string | null;
	slots: Array<string | null>;
	eventName: string;
	categoryName: string;
	commentatorIds: string[];
	mappingKey: string | null;
};

export type BroadcastConfigDraft = Omit<BroadcastConfig, "revision">;

export type PbDisplay = {
	time: string;
	place: number | null;
};

export type ResultDisplay = {
	place: number | null;
	time: string | null;
	status: ResultStatus;
};

export type PlayerBarPresentation = {
	userId: string;
	name: string;
	pb: PbDisplay | null;
	twitch: string | null;
	youtube: string | null;
	result: ResultDisplay | null;
};

export type CommonInfoPresentation = {
	eventName: string;
	categoryName: string;
	commentators: string[];
	raceStatus: string;
	record: {
		label: string;
		time: string;
		holder: string | null;
	} | null;
};

export type RacePresentation = {
	revision: number;
	updatedAt: string;
	raceUrl: string | null;
	raceId: string | null;
	raceName: string;
	players: Array<PlayerBarPresentation | null>;
	info: CommonInfoPresentation;
};

export type ParticipantPresentation = {
	userId: string;
	name: string;
	playerId: string | null;
	pb: PbDisplay | null;
	result: ResultDisplay | null;
};

export type ParticipantsPresentation = {
	revision: number;
	updatedAt: string;
	raceName: string;
	categoryName: string;
	raceStatus: string;
	participants: ParticipantPresentation[];
};

export type LeaderboardEntryPresentation = {
	place: number;
	time: string;
	players: string[];
};

export type LeaderboardPresentation = {
	revision: number;
	updatedAt: string;
	mappingLabel: string;
	gameName: string;
	categoryName: string;
	status: "ready" | "empty" | "unavailable" | "error";
	message: string | null;
	entries: LeaderboardEntryPresentation[];
};

export type ResultEntryPresentation = {
	userId: string;
	name: string;
	place: number | null;
	time: string | null;
	status: ResultStatus;
};

export type ResultPresentation = {
	revision: number;
	updatedAt: string;
	raceName: string;
	categoryName: string;
	raceStatus: string;
	results: ResultEntryPresentation[];
};

export type IntegrationState =
	| "idle"
	| "loading"
	| "ready"
	| "error"
	| "unavailable";

export type MappingOption = {
	key: string;
	label: string;
};

export type PlayerOption = {
	playerId: string;
	displayName: string;
};

export type WatchedRaceSummary = {
	url: string;
	name: string;
	category: string;
	status: string;
};

export type BroadcastStatus = {
	revision: number;
	updatedAt: string;
	race: {
		state: IntegrationState;
		url: string | null;
		watchId: string | null;
		connection: string | null;
		raceId: string | null;
		message: string | null;
	};
	playerManager: {
		state: IntegrationState;
		message: string | null;
	};
	speedrun: {
		state: IntegrationState;
		message: string | null;
		selectedMappingKey: string | null;
		effectiveMappingKey: string | null;
		mappingLabel: string | null;
		fetchedAt: string | null;
		stale: boolean;
	};
	mappings: MappingOption[];
	races: WatchedRaceSummary[];
};

export type PreviewRace = {
	url: string;
	name: string;
	categorySlug: string;
	categoryName: string;
	goal: string;
	status: string;
	entrants: Array<{
		userId: string;
		name: string;
		playerId: string | null;
		displayName: string;
	}>;
};

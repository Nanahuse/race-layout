import type {
	BroadcastConfig,
	BroadcastConfigDraft,
	MappingOption,
	PlayerOption,
	PreviewRace,
} from "./types";

export const APPLY_CONFIG_MESSAGE = "race-broadcast.apply-config";
export const PREVIEW_RACE_MESSAGE = "race-broadcast.preview-race";
export const REFRESH_RECORDS_MESSAGE = "race-broadcast.refresh-records";
export const RECONNECT_RACE_MESSAGE = "race-broadcast.reconnect-race";
export const LIST_PLAYERS_MESSAGE = "race-broadcast.list-players";

export type ApplyConfigRequest = {
	expectedRevision: number;
	config: BroadcastConfigDraft;
};

export type ApplyConfigResponse =
	| {ok: true; config: BroadcastConfig}
	| {
			ok: false;
			code:
				| "revision_conflict"
				| "invalid_config"
				| "race_unavailable"
				| "internal_error";
			message: string;
			current?: BroadcastConfig;
	  };

export type PreviewRaceRequest = {
	url: string;
};

export type PreviewRaceResponse =
	| {ok: true; race: PreviewRace; mappings: MappingOption[]}
	| {ok: false; message: string};

export type RefreshRecordsResponse = {ok: true} | {ok: false; message: string};

export type ReconnectRaceResponse = {ok: true} | {ok: false; message: string};

export type ListPlayersResponse =
	| {ok: true; players: PlayerOption[]}
	| {ok: false; message: string};

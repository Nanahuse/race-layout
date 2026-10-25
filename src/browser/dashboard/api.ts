import {
	APPLY_CONFIG_MESSAGE,
	type ApplyConfigRequest,
	type ApplyConfigResponse,
	PREVIEW_RACE_MESSAGE,
	type PreviewRaceRequest,
	type PreviewRaceResponse,
	RECONNECT_RACE_MESSAGE,
	REFRESH_RECORDS_MESSAGE,
	type ReconnectRaceResponse,
	type RefreshRecordsResponse,
} from "../../shared/messages";

const REQUEST_TIMEOUT_MS = 30_000;

const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
	Promise.race([
		promise,
		new Promise<T>((_resolve, reject) => {
			setTimeout(
				() => reject(new Error("NodeCG did not respond in time")),
				REQUEST_TIMEOUT_MS,
			);
		}),
	]);

export const applyBroadcastConfig = (
	request: ApplyConfigRequest,
): Promise<ApplyConfigResponse> =>
	withTimeout(
		nodecg.sendMessage<ApplyConfigResponse>(APPLY_CONFIG_MESSAGE, request),
	);

export const previewRace = (
	request: PreviewRaceRequest,
): Promise<PreviewRaceResponse> =>
	withTimeout(
		nodecg.sendMessage<PreviewRaceResponse>(PREVIEW_RACE_MESSAGE, request),
	);

export const refreshRecords = (): Promise<RefreshRecordsResponse> =>
	withTimeout(
		nodecg.sendMessage<RefreshRecordsResponse>(REFRESH_RECORDS_MESSAGE),
	);

export const reconnectRace = (): Promise<ReconnectRaceResponse> =>
	withTimeout(
		nodecg.sendMessage<ReconnectRaceResponse>(RECONNECT_RACE_MESSAGE),
	);

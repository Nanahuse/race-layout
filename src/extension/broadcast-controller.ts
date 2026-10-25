import type {RaceState} from "@nanahuse/racetime-protocol";
import type NodeCG from "@nodecg/types";
import {
	broadcastConfigsEqual,
	normalizeRaceUrl,
	parseBroadcastConfig,
	validateBroadcastConfigDraft,
} from "../shared/config";
import {
	createDefaultBroadcastConfig,
	createDefaultBroadcastStatus,
	createEmptyLeaderboardPresentation,
	createEmptyParticipantsPresentation,
	createEmptyRacePresentation,
	createEmptyResultPresentation,
} from "../shared/defaults";
import {
	APPLY_CONFIG_MESSAGE,
	type ApplyConfigRequest,
	type ApplyConfigResponse,
	LIST_PLAYERS_MESSAGE,
	type ListPlayersResponse,
	PREVIEW_RACE_MESSAGE,
	type PreviewRaceResponse,
	RECONNECT_RACE_MESSAGE,
	REFRESH_RACE_SNAPSHOT_MESSAGE,
	REFRESH_RECORDS_MESSAGE,
	type ReconnectRaceResponse,
	type RefreshRaceSnapshotResponse,
	type RefreshRecordsResponse,
} from "../shared/messages";
import {REPLICANTS} from "../shared/replicants";
import type {
	BroadcastConfig,
	BroadcastConfigDraft,
	BroadcastStatus,
	IntegrationState,
	LeaderboardPresentation,
	MappingOption,
	ParticipantsPresentation,
	RacePresentation,
	ResultPresentation,
} from "../shared/types";
import {currentParticipants} from "./current-participants";
import {RaceTimeGateway} from "./integrations/racetime-gateway";
import {PlayerManagerAdapter} from "./player-manager-adapter";
import {PresentationProjector} from "./presentation-projector";
import {type PreparedWatch, RaceSubscription} from "./race-subscription";
import {RecordsCoordinator} from "./records-coordinator";

type ReplicantHandle<T> = {
	value: T | undefined;
};

const RACE_RESTORE_RETRY_MS = 15_000;

const errorText = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const reply = (
	ack: NodeCG.Acknowledgement | undefined,
	response: unknown,
): void => {
	if (!ack || ack.handled) return;
	ack(null, response);
};

export class BroadcastController {
	private readonly configRep: ReplicantHandle<BroadcastConfig>;
	private readonly raceRep: ReplicantHandle<RacePresentation>;
	private readonly participantsRep: ReplicantHandle<ParticipantsPresentation>;
	private readonly leaderboardRep: ReplicantHandle<LeaderboardPresentation>;
	private readonly resultRep: ReplicantHandle<ResultPresentation>;
	private readonly statusRep: ReplicantHandle<BroadcastStatus>;
	private readonly gateway: RaceTimeGateway;
	private readonly playerManager: PlayerManagerAdapter;
	private readonly records: RecordsCoordinator;
	private readonly subscription: RaceSubscription;
	private readonly projector = new PresentationProjector();
	private config: BroadcastConfig;
	private raceState: RaceState | null = null;
	private raceRestoreError: string | null = null;
	private restoreTimer: ReturnType<typeof setTimeout> | null = null;
	private presentationRevision = 0;
	private statusRevision = 0;
	private lastProjectionSignature = "";
	private lastStatusSignature = "";
	private applyQueue: Promise<void> = Promise.resolve();
	private stopped = false;

	constructor(private readonly nodecg: NodeCG.ServerAPI) {
		this.configRep = nodecg.Replicant<BroadcastConfig>(
			REPLICANTS.broadcastConfig,
			{
				persistent: true,
				defaultValue: createDefaultBroadcastConfig(),
			},
		) as unknown as ReplicantHandle<BroadcastConfig>;
		this.raceRep = nodecg.Replicant<RacePresentation>(
			REPLICANTS.racePresentation,
			{
				persistent: false,
				defaultValue: createEmptyRacePresentation(),
			},
		) as unknown as ReplicantHandle<RacePresentation>;
		this.participantsRep = nodecg.Replicant<ParticipantsPresentation>(
			REPLICANTS.participantsPresentation,
			{
				persistent: false,
				defaultValue: createEmptyParticipantsPresentation(),
			},
		) as unknown as ReplicantHandle<ParticipantsPresentation>;
		this.leaderboardRep = nodecg.Replicant<LeaderboardPresentation>(
			REPLICANTS.leaderboardPresentation,
			{
				persistent: false,
				defaultValue: createEmptyLeaderboardPresentation(),
			},
		) as unknown as ReplicantHandle<LeaderboardPresentation>;
		this.resultRep = nodecg.Replicant<ResultPresentation>(
			REPLICANTS.resultPresentation,
			{
				persistent: false,
				defaultValue: createEmptyResultPresentation(),
			},
		) as unknown as ReplicantHandle<ResultPresentation>;
		this.statusRep = nodecg.Replicant<BroadcastStatus>(
			REPLICANTS.broadcastStatus,
			{
				persistent: false,
				defaultValue: createDefaultBroadcastStatus(),
			},
		) as unknown as ReplicantHandle<BroadcastStatus>;

		this.config = this.readConfig();
		this.gateway = new RaceTimeGateway(nodecg);
		this.playerManager = new PlayerManagerAdapter(nodecg, () => {
			this.project();
			this.publishStatus();
		});
		this.records = new RecordsCoordinator(this.gateway, () => {
			this.project();
			this.publishStatus();
		});
		this.subscription = new RaceSubscription(
			nodecg,
			this.gateway,
			(state) => this.handleRaceState(state),
			() => this.publishStatus(),
		);
	}

	async start(): Promise<void> {
		this.registerMessages();
		this.playerManager.start();
		await this.restoreRace();
		this.project();
		this.publishStatus();
		this.nodecg.once("serverStopping", () => {
			void this.dispose();
		});
	}

	private readConfig(): BroadcastConfig {
		const raw: unknown = this.configRep.value;
		if (raw === undefined) return createDefaultBroadcastConfig();
		try {
			return parseBroadcastConfig(raw);
		} catch (error) {
			this.nodecg.log.error(
				`broadcast-config is invalid and was reset: ${errorText(error)}`,
			);
			const fallback = createDefaultBroadcastConfig();
			this.configRep.value = fallback;
			return fallback;
		}
	}

	private registerMessages(): void {
		this.nodecg.listenFor(
			APPLY_CONFIG_MESSAGE,
			(data: Partial<ApplyConfigRequest>, ack?: NodeCG.Acknowledgement) => {
				void this.applyConfig(data)
					.then((response) => {
						reply(ack, response);
					})
					.catch((error: unknown) => {
						reply(ack, {
							ok: false,
							code: "internal_error",
							message: errorText(error),
						} satisfies ApplyConfigResponse);
					});
			},
		);
		this.nodecg.listenFor(
			PREVIEW_RACE_MESSAGE,
			(data: {url?: unknown}, ack?: NodeCG.Acknowledgement) => {
				void this.previewRace(data)
					.then((response) => {
						reply(ack, response);
					})
					.catch((error: unknown) => {
						reply(ack, {
							ok: false,
							message: errorText(error),
						} satisfies PreviewRaceResponse);
					});
			},
		);
		this.nodecg.listenFor(
			REFRESH_RECORDS_MESSAGE,
			(_data: unknown, ack?: NodeCG.Acknowledgement) => {
				reply(ack, this.refreshRecords());
			},
		);
		this.nodecg.listenFor(
			RECONNECT_RACE_MESSAGE,
			(_data: unknown, ack?: NodeCG.Acknowledgement) => {
				void this.reconnectRace()
					.then((response) => {
						reply(ack, response);
					})
					.catch((error: unknown) => {
						reply(ack, {
							ok: false,
							message: errorText(error),
						} satisfies ReconnectRaceResponse);
					});
			},
		);
		this.nodecg.listenFor(
			REFRESH_RACE_SNAPSHOT_MESSAGE,
			(_data: unknown, ack?: NodeCG.Acknowledgement) => {
				void this.refreshRaceSnapshot()
					.then((response) => {
						reply(ack, response);
					})
					.catch((error: unknown) => {
						reply(ack, {
							ok: false,
							message: errorText(error),
						} satisfies RefreshRaceSnapshotResponse);
					});
			},
		);
		this.nodecg.listenFor(
			LIST_PLAYERS_MESSAGE,
			(_data: unknown, ack?: NodeCG.Acknowledgement) => {
				reply(ack, {
					ok: true,
					players: this.playerManager.listPlayers(),
				} satisfies ListPlayersResponse);
			},
		);
	}

	private async restoreRace(): Promise<void> {
		this.clearRestoreRetry();
		if (!this.config.raceUrl) {
			this.raceRestoreError = null;
			return;
		}
		try {
			const prepared = await this.subscription.prepare(this.config.raceUrl);
			if (this.stopped) {
				await this.subscription.discard(prepared);
				return;
			}
			this.subscription.commit(prepared);
			this.raceRestoreError = null;
			this.nodecg.log.info(`Watching race: ${prepared.url}`);
		} catch (error) {
			this.raceRestoreError = errorText(error);
			this.nodecg.log.warn(
				`Failed to restore race watch: ${this.raceRestoreError}`,
			);
			this.scheduleRestoreRetry();
		}
	}

	private scheduleRestoreRetry(): void {
		if (this.stopped || this.restoreTimer || !this.config.raceUrl) return;
		this.restoreTimer = setTimeout(() => {
			this.restoreTimer = null;
			void this.restoreRace();
		}, RACE_RESTORE_RETRY_MS);
	}

	private clearRestoreRetry(): void {
		if (!this.restoreTimer) return;
		clearTimeout(this.restoreTimer);
		this.restoreTimer = null;
	}

	private applyConfig(
		payload: Partial<ApplyConfigRequest> | null | undefined,
	): Promise<ApplyConfigResponse> {
		const run = () => this.applyConfigInternal(payload);
		const result = this.applyQueue.then(run, run);
		this.applyQueue = result.then(
			() => undefined,
			() => undefined,
		);
		return result;
	}

	private async applyConfigInternal(
		payload: Partial<ApplyConfigRequest> | null | undefined,
	): Promise<ApplyConfigResponse> {
		if (
			!payload ||
			typeof payload !== "object" ||
			typeof payload.expectedRevision !== "number"
		)
			return {
				ok: false,
				code: "invalid_config",
				message: "Invalid apply-config request",
			};
		if (payload.expectedRevision !== this.config.revision)
			return {
				ok: false,
				code: "revision_conflict",
				message:
					"Broadcast configuration was changed elsewhere. Reload before applying.",
				current: this.config,
			};

		let draft: BroadcastConfigDraft;
		try {
			draft = validateBroadcastConfigDraft(payload.config);
		} catch (error) {
			return {
				ok: false,
				code: "invalid_config",
				message: errorText(error),
			};
		}

		if (broadcastConfigsEqual(draft, this.config))
			return {ok: true, config: this.config};

		const currentWatch = this.subscription.snapshot();
		const mustAcquire =
			draft.raceUrl !== null && draft.raceUrl !== currentWatch.url;
		const mustRelease = draft.raceUrl === null && currentWatch.url !== null;

		let prepared: PreparedWatch | null = null;
		if (mustAcquire && draft.raceUrl) {
			try {
				prepared = await this.subscription.prepare(draft.raceUrl);
			} catch (error) {
				return {
					ok: false,
					code: "race_unavailable",
					message: errorText(error),
				};
			}
		}

		if (payload.expectedRevision !== this.config.revision) {
			if (prepared) await this.subscription.discard(prepared);
			return {
				ok: false,
				code: "revision_conflict",
				message:
					"Broadcast configuration was changed elsewhere. Reload before applying.",
				current: this.config,
			};
		}

		const next: BroadcastConfig = {
			...draft,
			revision: this.config.revision + 1,
		};
		try {
			this.configRep.value = next;
		} catch (error) {
			if (prepared) await this.subscription.discard(prepared);
			return {
				ok: false,
				code: "internal_error",
				message: `Failed to save broadcast configuration: ${errorText(error)}`,
			};
		}
		this.config = next;
		this.clearRestoreRetry();
		this.raceRestoreError = null;

		if (prepared) {
			this.subscription.commit(prepared);
		} else if (mustRelease) {
			await this.subscription.clear();
		}

		this.records.request(
			{
				race: this.raceState?.race ?? null,
				playerIds: this.participantPlayerIds(),
				mappingKey: this.config.mappingKey,
			},
			false,
		);
		this.project();
		this.publishStatus();
		return {ok: true, config: next};
	}

	private async previewRace(
		payload: {url?: unknown} | null | undefined,
	): Promise<PreviewRaceResponse> {
		if (!payload || typeof payload.url !== "string")
			return {ok: false, message: "Race URL is required"};
		let url: string;
		try {
			url = normalizeRaceUrl(payload.url);
		} catch (error) {
			return {ok: false, message: errorText(error)};
		}
		if (!url) return {ok: false, message: "Race URL is required"};

		try {
			const resolved = await this.gateway.fetchRace(url);
			const participantByUserId = new Map(
				resolved.participants.map((participant) => [
					participant.racetimeUserId,
					participant,
				]),
			);
			let mappings: MappingOption[] = [];
			try {
				const resolution = await this.gateway.resolveCategoryMapping(
					resolved.race.category.slug,
					resolved.race.category.goal,
				);
				if (resolution.status === "resolved")
					mappings = resolution.mappings.map((mapping) => ({
						key: mapping.key,
						label: mapping.label,
					}));
			} catch {
				mappings = [];
			}
			return {
				ok: true,
				race: {
					url: resolved.race.url,
					name: resolved.race.name,
					categorySlug: resolved.race.category.slug,
					categoryName: resolved.race.category.name,
					goal: resolved.race.category.goal,
					status: resolved.race.status,
					entrants: resolved.race.entrants.map((entrant) => {
						const participant = participantByUserId.get(entrant.userId);
						return {
							userId: entrant.userId,
							name: entrant.name,
							playerId: participant?.playerId ?? null,
							displayName:
								participant?.player?.displayName?.trim() || entrant.name,
						};
					}),
				},
				mappings,
			};
		} catch (error) {
			return {ok: false, message: errorText(error)};
		}
	}

	private refreshRecords(): RefreshRecordsResponse {
		if (!this.raceState?.race)
			return {ok: false, message: "No race is currently available"};
		this.records.refresh();
		return {ok: true};
	}

	private async reconnectRace(): Promise<ReconnectRaceResponse> {
		if (!this.config.raceUrl)
			return {ok: false, message: "No race URL is configured"};
		try {
			const prepared = await this.subscription.prepare(this.config.raceUrl);
			this.subscription.commit(prepared);
			this.raceRestoreError = null;
			this.clearRestoreRetry();
			this.publishStatus();
			return {ok: true};
		} catch (error) {
			this.raceRestoreError = errorText(error);
			this.publishStatus();
			return {ok: false, message: this.raceRestoreError};
		}
	}

	private async refreshRaceSnapshot(): Promise<RefreshRaceSnapshotResponse> {
		const current = this.raceState;
		if (!current?.race)
			return {ok: false, message: "No race is currently displayed"};
		if (current.race.status !== "finished")
			return {
				ok: false,
				message: "Reconnect the watch for an in-progress race",
			};
		try {
			const resolved = await this.gateway.fetchRace(current.race.url);
			if (this.raceState?.race?.url !== current.race.url)
				return {
					ok: false,
					message: "The displayed race changed while refreshing",
				};
			const raceRevision = current.raceRevision + 1;
			const state: RaceState = {
				revision: current.revision + 1,
				raceRevision,
				participantsRevision: current.participantsRevision + 1,
				resolution: {
					state: resolved.resolution.state,
					raceRevision,
					directoryRevision: resolved.resolution.directoryRevision,
				},
				url: resolved.race.url,
				race: resolved.race,
				connection: "closed",
				error: null,
				participants: resolved.participants,
			};
			this.raceRestoreError = null;
			this.handleRaceState(state);
			return {ok: true};
		} catch (error) {
			return {ok: false, message: errorText(error)};
		}
	}

	private handleRaceState(state: RaceState | null): void {
		this.raceState = state;
		this.records.request(
			{
				race: state?.race ?? null,
				playerIds: this.participantPlayerIds(),
				mappingKey: this.config.mappingKey,
			},
			false,
		);
		this.project();
		this.publishStatus();
	}

	private participantPlayerIds(): string[] {
		return [
			...new Set(
				currentParticipants(this.raceState)
					.map((participant) => participant.playerId)
					.filter((playerId): playerId is string => Boolean(playerId)),
			),
		];
	}

	private project(): void {
		if (this.stopped) return;
		const now = new Date().toISOString();
		const nextRevision = this.presentationRevision + 1;
		const projection = this.projector.project(
			{
				config: this.config,
				raceState: this.raceState,
				records: this.records.getSnapshot(),
				getPlayer: (playerId) => this.playerManager.getPlayer(playerId),
			},
			nextRevision,
			now,
		);
		const signature = JSON.stringify({
			race: {...projection.race, revision: 0, updatedAt: ""},
			participants: {...projection.participants, revision: 0, updatedAt: ""},
			leaderboard: {...projection.leaderboard, revision: 0, updatedAt: ""},
			result: {...projection.result, revision: 0, updatedAt: ""},
		});
		if (signature === this.lastProjectionSignature) return;
		this.lastProjectionSignature = signature;
		this.presentationRevision = nextRevision;
		this.raceRep.value = projection.race;
		this.participantsRep.value = projection.participants;
		this.leaderboardRep.value = projection.leaderboard;
		this.resultRep.value = projection.result;
	}

	private publishStatus(): void {
		if (this.stopped) return;
		const snapshot = this.subscription.snapshot();
		const race = this.raceState?.race ?? null;
		const finished = race?.status === "finished";
		let raceState: IntegrationState = "idle";
		if (this.config.raceUrl) {
			if (!race) raceState = this.raceRestoreError ? "error" : "loading";
			else if (snapshot.missing && !finished) raceState = "error";
			else raceState = "ready";
		}
		const recordsStatus = this.records.getSnapshot().status;
		const status: Omit<BroadcastStatus, "revision" | "updatedAt"> = {
			race: {
				state: raceState,
				url: this.raceState?.url ?? snapshot.url ?? this.config.raceUrl,
				watchId: snapshot.watchId,
				connection:
					this.raceState?.connection ?? snapshot.state?.connection ?? null,
				raceId: race?.raceId ?? null,
				message:
					this.raceRestoreError ??
					this.raceState?.error ??
					(snapshot.missing && !finished
						? "Race watch is no longer available"
						: null),
			},
			playerManager: this.playerManager.getStatus(),
			speedrun: {
				state: recordsStatus.state,
				message: recordsStatus.message,
				selectedMappingKey: recordsStatus.selectedMappingKey,
				effectiveMappingKey: recordsStatus.effectiveMappingKey,
				mappingLabel: recordsStatus.mappingLabel,
				fetchedAt: recordsStatus.fetchedAt,
				stale: recordsStatus.stale,
			},
			mappings: this.records.getMappings(),
			races: this.subscription.availableRaces(),
		};
		const signature = JSON.stringify(status);
		if (signature === this.lastStatusSignature) return;
		this.lastStatusSignature = signature;
		this.statusRevision++;
		this.statusRep.value = {
			...status,
			revision: this.statusRevision,
			updatedAt: new Date().toISOString(),
		};
	}

	private async dispose(): Promise<void> {
		if (this.stopped) return;
		this.stopped = true;
		this.clearRestoreRetry();
		this.playerManager.stop();
		await this.subscription.dispose();
	}
}

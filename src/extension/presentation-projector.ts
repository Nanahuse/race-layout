import {
	type Player,
	resolveDisplayName,
} from "@nanahuse/player-manager-protocol";
import type {
	Entrant,
	Participant,
	Race,
	RaceResult,
	RaceState,
	SpeedrunPlayerBest,
} from "@nanahuse/racetime-protocol";
import type {
	BroadcastConfig,
	CommonInfoPresentation,
	LeaderboardEntryPresentation,
	LeaderboardPresentation,
	ParticipantPresentation,
	ParticipantsPresentation,
	PbDisplay,
	PlayerBarPresentation,
	RacePresentation,
	ResultDisplay,
	ResultEntryPresentation,
	ResultPresentation,
	ResultStatus,
} from "../shared/types";
import {formatElapsed, formatRaceStatus} from "./format";
import type {RecordsSnapshot} from "./records-coordinator";

export type ProjectionInput = {
	config: BroadcastConfig;
	raceState: RaceState | null;
	records: RecordsSnapshot;
	getPlayer: (playerId: string) => Player | undefined;
};

type Projection = {
	race: RacePresentation;
	participants: ParticipantsPresentation;
	leaderboard: LeaderboardPresentation;
	result: ResultPresentation;
};

const resultStatus = (value: string): ResultStatus => {
	if (value === "finished" || value === "dnf" || value === "dq") return value;
	return "other";
};

const buildLookups = (race: Race | null) => {
	const entrants = new Map<string, Entrant>();
	const results = new Map<string, RaceResult>();
	if (race) {
		for (const entrant of race.entrants) entrants.set(entrant.userId, entrant);
		for (const result of race.results) results.set(result.userId, result);
	}
	return {entrants, results};
};

const buildParticipantLookup = (raceState: RaceState | null) => {
	const participants = new Map<string, Participant>();
	for (const participant of raceState?.participants ?? [])
		participants.set(participant.racetimeUserId, participant);
	return participants;
};

const displayName = (
	playerId: string | null,
	participant: Participant | undefined,
	entrant: Entrant | undefined,
	getPlayer: (playerId: string) => Player | undefined,
): {name: string; player: Player | undefined} => {
	const player = playerId ? getPlayer(playerId) : undefined;
	if (player) return {name: resolveDisplayName(player), player};
	const resolved = participant?.player?.displayName?.trim();
	if (resolved) return {name: resolved, player};
	const fallback = entrant?.name?.trim() || participant?.player?.racetime?.name;
	return {name: fallback || "Unknown", player};
};

const youtubeAccount = (value: string | null | undefined): string | null => {
	if (!value) return null;
	try {
		const url = new URL(value);
		const path = url.pathname.replace(/^\/+/, "");
		return path ? `youtube.com/${path}` : url.hostname;
	} catch {
		return value;
	}
};

const toPb = (best: SpeedrunPlayerBest | undefined): PbDisplay | null => {
	if (best?.state !== "found" || !best.run) return null;
	const time = formatElapsed(best.run.time, 3);
	if (!time) return null;
	return {time, place: best.place ?? best.run.place ?? null};
};

const toResult = (result: RaceResult | undefined): ResultDisplay | null => {
	if (!result) return null;
	const status = resultStatus(result.status);
	return {
		place: result.place,
		time: status === "finished" ? formatElapsed(result.time, 1) : null,
		status,
	};
};

const buildInfo = (
	config: BroadcastConfig,
	race: Race | null,
	records: RecordsSnapshot,
): CommonInfoPresentation => {
	const entries = records.leaderboard?.entries ?? [];
	const top = entries.length
		? [...entries].sort((left, right) => left.place - right.place)[0]
		: undefined;
	const topTime = top ? formatElapsed(top.run.time, 3) : null;
	const holder = top
		? top.run.players
				.map((player) => player.displayName?.trim() || player.name)
				.join(" & ")
		: null;
	return {
		eventName: config.eventName || race?.name || "—",
		categoryName: config.categoryName || race?.category.name || "—",
		commentators: [...config.commentators],
		raceStatus: formatRaceStatus(race?.status),
		record:
			topTime && records.activeMapping
				? {label: "TOP RECORD", time: topTime, holder}
				: null,
	};
};

const statusOrder = (status: ResultStatus): number => {
	switch (status) {
		case "finished":
			return 0;
		case "dnf":
			return 1;
		case "dq":
			return 2;
		default:
			return 3;
	}
};

export class PresentationProjector {
	project(
		input: ProjectionInput,
		revision: number,
		updatedAt: string,
	): Projection {
		const {config, raceState, records, getPlayer} = input;
		const race = raceState?.race ?? null;
		const {entrants, results} = buildLookups(race);
		const participants = buildParticipantLookup(raceState);

		const resolve = (userId: string) => {
			const participant = participants.get(userId);
			const entrant = entrants.get(userId);
			const playerId = participant?.playerId ?? null;
			return {
				participant,
				entrant,
				playerId,
				...displayName(playerId, participant, entrant, getPlayer),
			};
		};

		const players = config.slots.map((userId) => {
			if (!userId) return null;
			const resolved = resolve(userId);
			if (!resolved.entrant && !resolved.participant) return null;
			const best = resolved.playerId
				? records.bests.get(resolved.playerId)
				: undefined;
			const twitchLogin =
				resolved.player?.twitch?.login ??
				resolved.participant?.player?.twitch?.login ??
				null;
			const youtube =
				resolved.player?.youtube ??
				resolved.participant?.player?.youtube ??
				null;
			const bar: PlayerBarPresentation = {
				userId,
				name: resolved.name,
				pb: toPb(best),
				twitch: twitchLogin ? `twitch.tv/${twitchLogin}` : null,
				youtube: youtubeAccount(youtube),
				result: toResult(results.get(userId)),
			};
			return bar;
		});

		const info = buildInfo(config, race, records);

		const participantEntries: ParticipantPresentation[] = (
			race?.entrants ?? []
		).map((entrant) => {
			const resolved = resolve(entrant.userId);
			const best = resolved.playerId
				? records.bests.get(resolved.playerId)
				: undefined;
			return {
				userId: entrant.userId,
				name: resolved.name,
				playerId: resolved.playerId,
				pb: toPb(best),
				result: toResult(results.get(entrant.userId)),
			};
		});

		const leaderboardEntries: LeaderboardEntryPresentation[] = [
			...(records.leaderboard?.entries ?? []),
		]
			.sort((left, right) => left.place - right.place)
			.map((entry) => ({
				place: entry.place,
				time: formatElapsed(entry.run.time, 3) ?? "",
				players: entry.run.players.map(
					(player) => player.displayName?.trim() || player.name,
				),
			}));

		const mappedLeaderboard = records.leaderboard;
		const leaderboardStatus: LeaderboardPresentation["status"] =
			!records.activeMapping
				? "unavailable"
				: mappedLeaderboard?.state === "error"
					? "error"
					: leaderboardEntries.length === 0
						? "empty"
						: "ready";

		const resultEntries: ResultEntryPresentation[] = (race?.results ?? [])
			.map((result) => {
				const resolved = resolve(result.userId);
				const status = resultStatus(result.status);
				return {
					userId: result.userId,
					name: resolved.name,
					place: result.place,
					time: status === "finished" ? formatElapsed(result.time, 1) : null,
					status,
				};
			})
			.sort((left, right) => {
				const statusDifference =
					statusOrder(left.status) - statusOrder(right.status);
				if (statusDifference !== 0) return statusDifference;
				if (left.place === null) return right.place === null ? 0 : 1;
				if (right.place === null) return -1;
				return left.place - right.place;
			});

		return {
			race: {
				revision,
				updatedAt,
				raceUrl: race?.url ?? raceState?.url ?? config.raceUrl,
				raceId: race?.raceId ?? null,
				raceName: race?.name ?? "",
				players,
				info,
			},
			participants: {
				revision,
				updatedAt,
				raceName: race?.name ?? "",
				categoryName: race?.category.name ?? "",
				raceStatus: formatRaceStatus(race?.status),
				participants: participantEntries,
			},
			leaderboard: {
				revision,
				updatedAt,
				mappingLabel: records.activeMapping?.label ?? "",
				gameName: records.activeMapping?.game.gameName ?? "",
				categoryName: records.activeMapping?.category.categoryName ?? "",
				status: leaderboardStatus,
				message: mappedLeaderboard?.message ?? records.status.message,
				entries: leaderboardEntries,
			},
			result: {
				revision,
				updatedAt,
				raceName: race?.name ?? "",
				categoryName: race?.category.name ?? "",
				raceStatus: formatRaceStatus(race?.status),
				results: resultEntries,
			},
		};
	}
}

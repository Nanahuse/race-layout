import type {
	Race,
	ResolvedCategoryMapping,
	SpeedrunLeaderboard,
	SpeedrunPlayerBest,
} from "@nanahuse/racetime-protocol";
import type {IntegrationState, MappingOption} from "../shared/types";
import {
	type RaceTimeGateway,
	RaceTimeGatewayError,
} from "./integrations/racetime-gateway";

export type RecordsContext = {
	race: Race | null;
	playerIds: string[];
	mappingKey: string | null;
};

export type RecordsStatus = {
	state: IntegrationState;
	message: string | null;
	selectedMappingKey: string | null;
	effectiveMappingKey: string | null;
	mappingLabel: string | null;
	fetchedAt: string | null;
	stale: boolean;
};

export type RecordsSnapshot = {
	mappings: ResolvedCategoryMapping[];
	activeMapping: ResolvedCategoryMapping | null;
	leaderboard: SpeedrunLeaderboard | null;
	bests: Map<string, SpeedrunPlayerBest>;
	fetchedAt: string | null;
	stale: boolean;
	status: RecordsStatus;
};

const emptyStatus = (): RecordsStatus => ({
	state: "idle",
	message: null,
	selectedMappingKey: null,
	effectiveMappingKey: null,
	mappingLabel: null,
	fetchedAt: null,
	stale: false,
});

const contextSignature = (context: RecordsContext): string => {
	if (!context.race) return "";
	return [
		context.race.raceId,
		context.race.category.slug,
		context.race.category.goal,
		context.mappingKey ?? "",
		context.playerIds.join(","),
	].join("\u0000");
};

const errorMessage = (error: unknown): string =>
	error instanceof RaceTimeGatewayError || error instanceof Error
		? error.message
		: "SRC records could not be loaded";

export class RecordsCoordinator {
	private context: RecordsContext = {
		race: null,
		playerIds: [],
		mappingKey: null,
	};
	private snapshot: RecordsSnapshot = {
		mappings: [],
		activeMapping: null,
		leaderboard: null,
		bests: new Map(),
		fetchedAt: null,
		stale: false,
		status: emptyStatus(),
	};
	private generation = 0;
	private requestedSignature: string | null = null;

	constructor(
		private readonly gateway: RaceTimeGateway,
		private readonly onChange: () => void,
	) {}

	request(context: RecordsContext, force = false): void {
		const previous = this.context;
		const normalized: RecordsContext = {
			race: context.race,
			playerIds: [...new Set(context.playerIds)].sort(),
			mappingKey: context.mappingKey,
		};
		this.context = normalized;
		if (!normalized.race) {
			this.generation++;
			this.requestedSignature = null;
			this.replaceSnapshot({
				mappings: [],
				activeMapping: null,
				leaderboard: null,
				bests: new Map(),
				fetchedAt: null,
				stale: false,
				status: emptyStatus(),
			});
			return;
		}
		const signature = contextSignature(normalized);
		if (!force && signature === this.requestedSignature) return;
		this.requestedSignature = signature;
		const generation = ++this.generation;

		const sameRace =
			previous.race?.raceId === normalized.race.raceId &&
			previous.race?.category.slug === normalized.race.category.slug &&
			previous.race?.category.goal === normalized.race.category.goal;
		const mappings = sameRace ? this.snapshot.mappings : [];
		this.replaceSnapshot({
			mappings,
			activeMapping: null,
			leaderboard: null,
			bests: new Map(),
			fetchedAt: null,
			stale: false,
			status: {
				state: "loading",
				message: null,
				selectedMappingKey: normalized.mappingKey,
				effectiveMappingKey: null,
				mappingLabel: null,
				fetchedAt: null,
				stale: false,
			},
		});
		void this.run(normalized, signature, generation, force);
	}

	refresh(): void {
		if (!this.context.race) return;
		this.request(this.context, true);
	}

	getSnapshot(): RecordsSnapshot {
		return this.snapshot;
	}

	getMappings(): MappingOption[] {
		return this.snapshot.mappings.map((mapping) => ({
			key: mapping.key,
			label: mapping.label,
		}));
	}

	private replaceSnapshot(snapshot: RecordsSnapshot): void {
		this.snapshot = snapshot;
		this.onChange();
	}

	private isCurrent(signature: string, generation: number): boolean {
		return (
			signature === this.requestedSignature && generation === this.generation
		);
	}

	private async run(
		context: RecordsContext,
		signature: string,
		generation: number,
		force: boolean,
	): Promise<void> {
		const race = context.race;
		if (!race) return;
		const {slug, goal} = race.category;
		try {
			const resolution = await this.gateway.resolveCategoryMapping(slug, goal);
			if (!this.isCurrent(signature, generation)) return;
			if (resolution.status !== "resolved") {
				this.fail(
					resolution.status === "unregistered"
						? "RaceTimeカテゴリにSRC Mappingが登録されていません"
						: resolution.message,
					[],
					context.mappingKey,
					"error",
				);
				return;
			}
			const mappings = resolution.mappings;
			if (mappings.length === 0) {
				this.fail(
					"SRC Mappingが見つかりません",
					mappings,
					context.mappingKey,
					"error",
				);
				return;
			}
			const activeMapping = this.selectMapping(mappings, context.mappingKey);
			if (!activeMapping) {
				this.fail(
					context.mappingKey
						? "選択したSRC Mappingが見つかりません。別のMappingには自動で切り替えません"
						: "表示するSRC Mappingを選択してください",
					mappings,
					context.mappingKey,
					"error",
				);
				return;
			}

			const [leaderboardOutcome, bestsOutcome] = await Promise.allSettled([
				this.gateway.getSpeedrunLeaderboards(slug, goal, force),
				context.playerIds.length > 0
					? this.gateway.getSpeedrunPlayerBests(
							slug,
							goal,
							context.playerIds,
							force,
						)
					: Promise.resolve(null),
			]);
			if (!this.isCurrent(signature, generation)) return;

			const failures: string[] = [];
			let leaderboardFailed = false;
			let leaderboard: SpeedrunLeaderboard | null = null;
			if (leaderboardOutcome.status === "rejected") {
				leaderboardFailed = true;
				failures.push(errorMessage(leaderboardOutcome.reason));
			} else {
				const response = leaderboardOutcome.value;
				if (response.status === "resolved") {
					leaderboard =
						response.leaderboards?.find(
							(candidate) => candidate.mapping.key === activeMapping.key,
						) ?? null;
					if (!leaderboard) {
						leaderboardFailed = true;
						failures.push("SRC Leaderboardの取得結果が見つかりません");
					}
				} else {
					leaderboardFailed = true;
					failures.push(
						response.status === "unregistered"
							? "RaceTimeカテゴリにSRC Mappingが登録されていません"
							: response.message,
					);
				}
			}

			const bests = new Map<string, SpeedrunPlayerBest>();
			const bestsResponse =
				bestsOutcome.status === "fulfilled" ? bestsOutcome.value : null;
			if (bestsOutcome.status === "rejected") {
				failures.push(errorMessage(bestsOutcome.reason));
			} else if (bestsResponse) {
				if (bestsResponse.status === "resolved") {
					const bestsResult = bestsResponse.results?.find(
						(candidate) => candidate.mapping.key === activeMapping.key,
					);
					for (const best of bestsResult?.players ?? []) {
						if (best.playerId) bests.set(best.playerId, best);
					}
				} else {
					failures.push(
						bestsResponse.status === "unregistered"
							? "RaceTimeカテゴリにSRC Mappingが登録されていません"
							: bestsResponse.message,
					);
				}
			}

			if (leaderboard?.state === "error") {
				failures.push(
					leaderboard.message ?? "SRC Leaderboardの取得に失敗しました",
				);
				if (leaderboard.entries.length === 0) leaderboardFailed = true;
			} else if (leaderboard?.state === "not_found") {
				failures.push("SRC Leaderboardに記録がありません");
			}
			if ([...bests.values()].some((best) => best.state === "error"))
				failures.push("一部プレイヤーのPB取得に失敗しました");

			const messages = [
				...new Set(failures.filter((value) => value.trim() !== "")),
			];
			const message = messages.length > 0 ? messages.join(" / ") : null;
			const stale =
				Boolean(leaderboard?.stale) || Boolean(bestsResponse?.stale);
			const fetchedAt =
				leaderboard?.fetchedAt ??
				bestsResponse?.fetchedAt ??
				new Date().toISOString();
			const state: IntegrationState = leaderboardFailed ? "error" : "ready";
			this.replaceSnapshot({
				mappings,
				activeMapping,
				leaderboard,
				bests,
				fetchedAt,
				stale,
				status: {
					state,
					message,
					selectedMappingKey: context.mappingKey,
					effectiveMappingKey: activeMapping.key,
					mappingLabel: activeMapping.label,
					fetchedAt,
					stale,
				},
			});
		} catch (error) {
			if (!this.isCurrent(signature, generation)) return;
			this.fail(
				errorMessage(error),
				this.snapshot.mappings,
				context.mappingKey,
				"error",
			);
		}
	}

	private selectMapping(
		mappings: ResolvedCategoryMapping[],
		mappingKey: string | null,
	): ResolvedCategoryMapping | null {
		if (mappingKey)
			return mappings.find((mapping) => mapping.key === mappingKey) ?? null;
		return mappings.length === 1 ? (mappings[0] ?? null) : null;
	}

	private fail(
		message: string,
		mappings: ResolvedCategoryMapping[],
		mappingKey: string | null,
		state: IntegrationState,
		activeMapping: ResolvedCategoryMapping | null = null,
	): void {
		this.replaceSnapshot({
			mappings,
			activeMapping,
			leaderboard: null,
			bests: new Map(),
			fetchedAt: null,
			stale: false,
			status: {
				state,
				message,
				selectedMappingKey: mappingKey,
				effectiveMappingKey: activeMapping?.key ?? null,
				mappingLabel: activeMapping?.label ?? null,
				fetchedAt: null,
				stale: false,
			},
		});
	}
}

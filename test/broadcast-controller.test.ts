import type {Player} from "@nanahuse/player-manager-protocol";
import type {
	RaceState,
	ResolvedCategoryMapping,
} from "@nanahuse/racetime-protocol";
import {describe, expect, it} from "vitest";
import {BroadcastController} from "../src/extension/broadcast-controller";
import {
	APPLY_CONFIG_MESSAGE,
	type ApplyConfigResponse,
} from "../src/shared/messages";
import {REPLICANTS} from "../src/shared/replicants";
import type {BroadcastConfig, RacePresentation} from "../src/shared/types";

type Listener = (data: unknown, ack?: unknown) => void;

class FakeReplicant<T> {
	private current: T | undefined;
	private readonly listeners = new Set<
		(value: T | undefined, oldValue: T | undefined) => void
	>();

	constructor(initial: T | undefined) {
		this.current = initial;
	}

	get value(): T | undefined {
		return this.current;
	}

	set value(next: T | undefined) {
		const old = this.current;
		this.current = next;
		for (const listener of this.listeners) listener(next, old);
	}

	on(
		event: "change",
		listener: (value: T | undefined, oldValue: T | undefined) => void,
	): void {
		if (event !== "change") return;
		this.listeners.add(listener);
		listener(this.current, undefined);
	}

	removeListener(
		event: "change",
		listener: (value: T | undefined, oldValue: T | undefined) => void,
	): void {
		if (event === "change") this.listeners.delete(listener);
	}
}

type ReplicantOptions<T> = {
	persistent?: boolean;
	defaultValue?: T;
};

class FakeNodeCG {
	readonly replicants = new Map<string, FakeReplicant<unknown>>();
	readonly messages = new Map<string, Listener>();
	readonly log = {
		info: () => {},
		warn: () => {},
		error: () => {},
	};
	readonly extensions: Record<string, unknown>;
	readonly watchCalls: string[] = [];
	readonly unwatchCalls: string[] = [];

	constructor(extensions: Record<string, unknown>) {
		this.extensions = extensions;
	}

	Replicant<T>(
		name: string,
		namespaceOrOptions?: string | ReplicantOptions<T>,
		maybeOptions?: ReplicantOptions<T>,
	): FakeReplicant<T> {
		const namespace =
			typeof namespaceOrOptions === "string"
				? namespaceOrOptions
				: "nodecg-race-broadcast";
		const options =
			typeof namespaceOrOptions === "string"
				? maybeOptions
				: namespaceOrOptions;
		const key = `${namespace}/${name}`;
		let replicant = this.replicants.get(key) as FakeReplicant<T> | undefined;
		if (!replicant) {
			replicant = new FakeReplicant<T>(options?.defaultValue);
			this.replicants.set(key, replicant as FakeReplicant<unknown>);
		}
		return replicant;
	}

	listenFor(
		messageName: string,
		bundleNameOrListener: string | Listener,
		maybeListener?: Listener,
	): void {
		const listener =
			typeof bundleNameOrListener === "string"
				? maybeListener
				: bundleNameOrListener;
		if (listener) this.messages.set(messageName, listener);
	}

	unlisten(): void {}

	once(): void {}

	get(bundle: string, name: string): FakeReplicant<unknown> | undefined {
		return this.replicants.get(`${bundle}/${name}`);
	}
}

const player: Player = {
	playerId: "player-1",
	revision: 1,
	manualDisplayName: "PM One",
	racetime: {userId: "rt-1", name: "RaceTime One"},
	speedrunCom: {userId: "src-1", name: "SRC One"},
	twitch: {login: "one", displayName: "One"},
	youtube: "https://youtube.com/@one",
	accounts: [],
};

const mapping: ResolvedCategoryMapping = {
	key: "mapping-1",
	label: "Any%",
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

const raceState = (url: string, watchId: string): RaceState => {
	const slug = url.split("/").at(-2) ?? "game";
	const raceSlug = url.split("/").at(-1) ?? "race";
	return {
		revision: 1,
		raceRevision: 1,
		participantsRevision: 1,
		resolution: {
			state: "ready",
			raceRevision: 1,
			directoryRevision: 1,
		},
		url,
		connection: "connected",
		error: null,
		race: {
			raceId: `${slug}/${raceSlug}`,
			url,
			version: 1,
			name: `Race ${watchId}`,
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
					name: "RaceTime One",
					twitchLogin: "one",
					status: "in_progress",
					finishTime: null,
					finishedAt: null,
					place: null,
				},
			],
			results: [],
		},
		participants: [
			{
				racetimeUserId: "rt-1",
				status: "matched",
				playerId: "player-1",
				player: {
					playerId: "player-1",
					revision: 1,
					displayName: "PM One",
					racetime: {userId: "rt-1", name: "RaceTime One"},
					speedrunCom: {userId: "src-1", name: "SRC One"},
					twitch: {userId: null, login: "one", displayName: "One"},
					youtube: "https://youtube.com/@one",
				},
				message: "",
			},
		],
	};
};

const createFakeNodeCG = () => {
	const state = {
		watchCount: 0,
	};
	let fake: FakeNodeCG;
	const playerManager = {
		apiVersion: 3,
		ready: Promise.resolve(),
		async request(operation: string) {
			if (operation === "status")
				return {ok: true, data: {ready: true, error: null}};
			if (operation === "list")
				return {
					ok: true,
					data: {schemaVersion: 2, revision: 1, players: [player]},
				};
			return {ok: false, error: {code: "unsupported_operation", message: ""}};
		},
	};
	const racetime = {
		apiVersion: 5,
		async request(
			operation: string,
			request: {url?: string; watchId?: string},
		) {
			switch (operation) {
				case "watchRace": {
					state.watchCount++;
					const watchId = `watch-${state.watchCount}`;
					const url = request.url ?? "";
					fake.watchCalls.push(url);
					return {
						ok: true,
						data: {watchId, state: raceState(url, watchId)},
					};
				}
				case "unwatchRace":
					if (request.watchId) fake.unwatchCalls.push(request.watchId);
					return {ok: true, data: {released: true}};
				case "resolveCategoryMapping":
					return {
						ok: true,
						data: {status: "resolved", mappings: [mapping]},
					};
				case "getSpeedrunLeaderboards":
					return {
						ok: true,
						data: {
							status: "resolved",
							mappings: [mapping],
							leaderboards: [
								{
									mapping,
									top: 20,
									fetchedAt: "2026-01-01T00:00:00Z",
									state: "ready",
									entries: [
										{
											place: 1,
											run: {
												runId: "run-1",
												url: "https://speedrun.com/run/1",
												time: "PT50S",
												date: null,
												players: [
													{
														userId: "src-1",
														name: "SRC One",
														url: "https://speedrun.com/user/src-1",
													},
												],
											},
										},
									],
									stale: false,
								},
							],
						},
					};
				case "getSpeedrunPlayerBests":
					return {
						ok: true,
						data: {
							status: "resolved",
							mappings: [mapping],
							results: [
								{
									mapping,
									variableValues: [],
									players: [
										{
											playerId: "player-1",
											srcUserId: "src-1",
											state: "found",
											run: {
												runId: "run-2",
												url: "https://speedrun.com/run/2",
												time: "PT1M",
												date: null,
												players: [],
												place: 2,
												gameId: "game-1",
												categoryId: "category-1",
												levelId: null,
												variables: {},
											},
											place: 2,
											fetchedAt: "2026-01-01T00:00:00Z",
											stale: false,
										},
									],
								},
							],
						},
					};
				default:
					return {
						ok: false,
						error: {code: "unsupported_operation", message: operation},
					};
			}
		},
	};
	fake = new FakeNodeCG({
		"player-manager": playerManager,
		"racetime-integration": racetime,
	});
	return fake;
};

const flush = async () => {
	for (let index = 0; index < 12; index++)
		await new Promise((resolve) => setTimeout(resolve, 0));
};

const invoke = <T>(
	fake: FakeNodeCG,
	messageName: string,
	payload: unknown,
): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const listener = fake.messages.get(messageName);
		if (!listener) {
			reject(new Error(`No listener for ${messageName}`));
			return;
		}
		const timer = setTimeout(
			() => reject(new Error(`Timeout for ${messageName}`)),
			2_000,
		);
		const ack = (error: unknown, response: unknown) => {
			clearTimeout(timer);
			if (error) reject(error);
			else resolve(response as T);
		};
		(ack as unknown as {handled: boolean}).handled = false;
		listener(payload, ack);
	});

const configDraft = (raceUrl: string) => ({
	raceUrl,
	slots: ["rt-1", null, null, null, null, null],
	eventName: "",
	categoryName: "",
	commentators: [],
	mappingKey: "mapping-1",
});

describe("BroadcastController", () => {
	it("applies configuration, projects presentations and owns its watch", async () => {
		const fake = createFakeNodeCG();
		const controller = new BroadcastController(
			fake as unknown as ConstructorParameters<typeof BroadcastController>[0],
		);
		await controller.start();
		await flush();

		const firstResponse = await invoke<ApplyConfigResponse>(
			fake,
			APPLY_CONFIG_MESSAGE,
			{
				expectedRevision: 0,
				config: configDraft("https://racetime.gg/game/race-1"),
			},
		);
		expect(firstResponse.ok).toBe(true);
		await flush();

		const storedConfig = fake.get(
			"nodecg-race-broadcast",
			REPLICANTS.broadcastConfig,
		)?.value as BroadcastConfig;
		expect(storedConfig.revision).toBe(1);
		const presentation = fake.get(
			"nodecg-race-broadcast",
			REPLICANTS.racePresentation,
		)?.value as RacePresentation;
		expect(presentation.players[0]?.name).toBe("PM One");
		expect(presentation.players[0]?.pb).toEqual({
			time: "1:00.000",
			place: 2,
		});
		expect(presentation.info.record?.time).toBe("0:50.000");

		const secondResponse = await invoke<ApplyConfigResponse>(
			fake,
			APPLY_CONFIG_MESSAGE,
			{
				expectedRevision: 1,
				config: configDraft("https://racetime.gg/game/race-2"),
			},
		);
		expect(secondResponse.ok).toBe(true);
		await flush();
		expect(fake.unwatchCalls).toContain("watch-1");
		expect(fake.unwatchCalls).not.toContain("watch-2");

		const conflict = await invoke<ApplyConfigResponse>(
			fake,
			APPLY_CONFIG_MESSAGE,
			{
				expectedRevision: 1,
				config: configDraft("https://racetime.gg/game/race-3"),
			},
		);
		expect(conflict).toMatchObject({
			ok: false,
			code: "revision_conflict",
		});
	});

	it("does not replace the saved race when the new watch fails", async () => {
		const fake = createFakeNodeCG();
		const racetime = fake.extensions["racetime-integration"] as {
			request: (operation: string, request: unknown) => Promise<unknown>;
		};
		const originalRequest = racetime.request.bind(racetime);
		racetime.request = async (operation, request) => {
			if (operation === "watchRace") {
				const typed = request as {url?: string};
				if (typed.url?.includes("broken"))
					return {
						ok: false,
						error: {code: "invalid_url", message: "broken URL"},
					};
			}
			return originalRequest(operation, request);
		};
		const controller = new BroadcastController(
			fake as unknown as ConstructorParameters<typeof BroadcastController>[0],
		);
		await controller.start();
		await flush();
		await invoke(fake, APPLY_CONFIG_MESSAGE, {
			expectedRevision: 0,
			config: configDraft("https://racetime.gg/game/race-1"),
		});
		await flush();

		const response = await invoke<ApplyConfigResponse>(
			fake,
			APPLY_CONFIG_MESSAGE,
			{
				expectedRevision: 1,
				config: configDraft("https://racetime.gg/game/broken"),
			},
		);
		expect(response).toMatchObject({
			ok: false,
			code: "race_unavailable",
		});
		const storedConfig = fake.get(
			"nodecg-race-broadcast",
			REPLICANTS.broadcastConfig,
		)?.value as BroadcastConfig;
		expect(storedConfig.revision).toBe(1);
		expect(storedConfig.raceUrl).toBe("https://racetime.gg/game/race-1");
	});
});

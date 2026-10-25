import {
	BUNDLE_NAME,
	RACES_REPLICANT,
	type RaceState,
	type RacesState,
} from "@nanahuse/racetime-protocol";
import type NodeCG from "@nodecg/types";
import type {WatchedRaceSummary} from "../shared/types";
import type {RaceTimeGateway} from "./integrations/racetime-gateway";

const EMPTY_RACES: RacesState = {schemaVersion: 1, races: []};

type RacesReplicant = {
	value: RacesState | undefined;
	on: (
		event: "change",
		handler: (value: RacesState, oldValue: RacesState | undefined) => void,
	) => void;
	removeListener: (
		event: "change",
		handler: (value: RacesState) => void,
	) => void;
};

export type PreparedWatch = {
	watchId: string;
	url: string;
	state: RaceState;
};

export type RaceSubscriptionSnapshot = {
	watchId: string | null;
	url: string | null;
	state: RaceState | null;
	missing: boolean;
};

export class RaceSubscription {
	private readonly racesRep: RacesReplicant;
	private active: PreparedWatch | null = null;
	private races: RacesState = EMPTY_RACES;
	private missing = false;
	private stopped = false;
	private initialized = false;
	private readonly handleRaces = (value: RacesState | undefined) => {
		this.races = value ?? EMPTY_RACES;
		if (!this.initialized) return;
		this.onRacesChanged();
		this.syncActive();
	};

	constructor(
		private readonly nodecg: NodeCG.ServerAPI,
		private readonly gateway: RaceTimeGateway,
		private readonly onRaceChanged: (state: RaceState | null) => void,
		private readonly onRacesChanged: () => void,
	) {
		this.racesRep = nodecg.Replicant<RacesState>(RACES_REPLICANT, BUNDLE_NAME, {
			defaultValue: EMPTY_RACES,
		}) as RacesReplicant;
		this.racesRep.on("change", this.handleRaces);
		this.races = this.racesRep.value ?? EMPTY_RACES;
		this.initialized = true;
	}

	async prepare(url: string): Promise<PreparedWatch> {
		const started = await this.gateway.watchRace(url);
		return {
			watchId: started.watchId,
			url: started.state.url,
			state: started.state,
		};
	}

	commit(prepared: PreparedWatch): void {
		const previous = this.active;
		const current = this.find(prepared.url);
		this.active = {
			...prepared,
			state: current ?? prepared.state,
		};
		this.missing = false;
		if (previous && previous.watchId !== prepared.watchId)
			void this.releaseWatch(previous.watchId);
		this.onRaceChanged(this.active.state);
	}

	async discard(prepared: PreparedWatch): Promise<void> {
		await this.releaseWatch(prepared.watchId);
	}

	async clear(): Promise<void> {
		const previous = this.active;
		this.active = null;
		this.missing = false;
		if (previous) await this.releaseWatch(previous.watchId);
		this.onRaceChanged(null);
	}

	snapshot(): RaceSubscriptionSnapshot {
		return {
			watchId: this.active?.watchId ?? null,
			url: this.active?.url ?? null,
			state: this.active?.state ?? null,
			missing: this.missing,
		};
	}

	availableRaces(): WatchedRaceSummary[] {
		const seen = new Set<string>();
		const result: WatchedRaceSummary[] = [];
		for (const state of this.races.races) {
			const race = state.race;
			if (!race) continue;
			const url = race.url || state.url;
			if (seen.has(url)) continue;
			seen.add(url);
			result.push({
				url,
				name: race.name,
				category: race.category.name,
				status: race.status,
			});
		}
		return result.sort((left, right) => left.name.localeCompare(right.name));
	}

	async dispose(): Promise<void> {
		this.stopped = true;
		this.racesRep.removeListener("change", this.handleRaces);
		const previous = this.active;
		this.active = null;
		if (previous) await this.releaseWatch(previous.watchId);
	}

	private find(url: string): RaceState | null {
		return this.races.races.find((race) => race.url === url) ?? null;
	}

	private syncActive(): void {
		if (this.stopped || !this.active) return;
		const current = this.find(this.active.url);
		if (current) {
			if (!this.missing && current.revision === this.active.state.revision)
				return;
			this.missing = false;
			this.active = {...this.active, state: current};
			this.onRaceChanged(current);
			return;
		}
		if (this.missing) return;
		this.missing = true;
		this.onRaceChanged({
			...this.active.state,
			connection: "closed",
			error: "Race watch is no longer available",
		});
	}

	private async releaseWatch(watchId: string): Promise<void> {
		try {
			await this.gateway.unwatchRace(watchId);
		} catch (error) {
			this.nodecg.log.warn(
				`Failed to release RaceTime watch ${watchId}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}
}

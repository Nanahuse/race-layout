import {
	API_VERSION,
	BUNDLE_NAME,
	type FailureCode,
	type Operations,
	type RaceTimeAPI,
} from "@nanahuse/racetime-protocol";
import type NodeCG from "@nodecg/types";

export type RaceTimeGatewayErrorCode =
	| FailureCode
	| "unavailable"
	| "version_mismatch";

export class RaceTimeGatewayError extends Error {
	constructor(
		readonly code: RaceTimeGatewayErrorCode,
		message: string,
	) {
		super(message);
		this.name = "RaceTimeGatewayError";
	}
}

export class RaceTimeGateway {
	constructor(private readonly nodecg: NodeCG.ServerAPI) {}

	private getApi(): RaceTimeAPI {
		const exposed: unknown = this.nodecg.extensions[BUNDLE_NAME];
		if (!exposed || typeof exposed !== "object")
			throw new RaceTimeGatewayError(
				"unavailable",
				"RaceTime Integration is not loaded",
			);
		const api = exposed as Partial<RaceTimeAPI>;
		if (api.apiVersion !== API_VERSION)
			throw new RaceTimeGatewayError(
				"version_mismatch",
				`RaceTime Integration API version ${String(api.apiVersion)} is not supported (expected ${API_VERSION})`,
			);
		if (typeof api.request !== "function")
			throw new RaceTimeGatewayError(
				"unavailable",
				"RaceTime Integration API is unavailable",
			);
		return api as RaceTimeAPI;
	}

	availability(): {available: boolean; message: string | null} {
		try {
			this.getApi();
			return {available: true, message: null};
		} catch (error) {
			return {
				available: false,
				message:
					error instanceof Error
						? error.message
						: "RaceTime Integration is unavailable",
			};
		}
	}

	async request<K extends keyof Operations>(
		operation: K,
		request: Operations[K]["request"],
	): Promise<Operations[K]["response"]> {
		const api = this.getApi();
		let response: Awaited<ReturnType<RaceTimeAPI["request"]>>;
		try {
			response = await api.request(operation, request);
		} catch (error) {
			throw new RaceTimeGatewayError(
				"internal_error",
				error instanceof Error ? error.message : "RaceTime request failed",
			);
		}
		if (!response.ok) {
			const name = response.error.message.trim() || "RaceTime request failed";
			throw new RaceTimeGatewayError(response.error.code, name);
		}
		return response.data as Operations[K]["response"];
	}

	watchRace(url: string): Promise<Operations["watchRace"]["response"]> {
		return this.request("watchRace", {url});
	}

	unwatchRace(watchId: string): Promise<Operations["unwatchRace"]["response"]> {
		return this.request("unwatchRace", {watchId});
	}

	fetchRace(url: string): Promise<Operations["fetchRace"]["response"]> {
		return this.request("fetchRace", {url});
	}

	resolveCategoryMapping(
		categorySlug: string,
		goal: string,
	): Promise<Operations["resolveCategoryMapping"]["response"]> {
		return this.request("resolveCategoryMapping", {categorySlug, goal});
	}

	getSpeedrunLeaderboards(
		categorySlug: string,
		goal: string,
		refresh = false,
	): Promise<Operations["getSpeedrunLeaderboards"]["response"]> {
		return this.request("getSpeedrunLeaderboards", {
			categorySlug,
			goal,
			refresh,
		});
	}

	getSpeedrunPlayerBests(
		categorySlug: string,
		goal: string,
		playerIds: string[],
		refresh = false,
	): Promise<Operations["getSpeedrunPlayerBests"]["response"]> {
		return this.request("getSpeedrunPlayerBests", {
			categorySlug,
			goal,
			playerIds,
			refresh,
		});
	}
}

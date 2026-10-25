import {
	API_VERSION,
	BUNDLE_NAME,
	eventMessageName,
	type Player,
	type PlayerManagerAPI,
} from "@nanahuse/player-manager-protocol";
import type NodeCG from "@nodecg/types";
import type {IntegrationState} from "../shared/types";

const RETRY_DELAY_MS = 15_000;

export class PlayerManagerAdapter {
	private api: PlayerManagerAPI | null = null;
	private directory = new Map<string, Player>();
	private directoryRevision = 0;
	private state: IntegrationState = "idle";
	private message: string | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private stopped = false;
	private refreshing: Promise<void> | null = null;
	private readonly handleDirectoryChanged = () => {
		void this.refresh();
	};

	constructor(
		private readonly nodecg: NodeCG.ServerAPI,
		private readonly onChange: () => void,
	) {}

	start(): void {
		this.nodecg.listenFor(
			eventMessageName("directoryChanged"),
			BUNDLE_NAME,
			this.handleDirectoryChanged,
		);
		void this.connect();
	}

	stop(): void {
		this.stopped = true;
		this.clearRetry();
		this.nodecg.unlisten(
			eventMessageName("directoryChanged"),
			BUNDLE_NAME,
			this.handleDirectoryChanged,
		);
	}

	getStatus(): {state: IntegrationState; message: string | null} {
		return {state: this.state, message: this.message};
	}

	getPlayer(playerId: string): Player | undefined {
		return this.directory.get(playerId);
	}

	getDirectoryRevision(): number {
		return this.directoryRevision;
	}

	private getApi(): PlayerManagerAPI {
		const exposed: unknown = this.nodecg.extensions[BUNDLE_NAME];
		if (!exposed || typeof exposed !== "object")
			throw new Error("Player Manager is not loaded");
		const api = exposed as Partial<PlayerManagerAPI>;
		if (api.apiVersion !== API_VERSION)
			throw new Error(
				`Player Manager API version ${String(api.apiVersion)} is not supported (expected ${API_VERSION})`,
			);
		if (typeof api.request !== "function")
			throw new Error("Player Manager API is unavailable");
		return api as PlayerManagerAPI;
	}

	private setStatus(state: IntegrationState, message: string | null): void {
		if (this.state === state && this.message === message) return;
		this.state = state;
		this.message = message;
		this.onChange();
	}

	private async connect(): Promise<void> {
		if (this.stopped) return;
		this.setStatus("loading", null);
		try {
			const api = this.getApi();
			await api.ready;
			const status = await api.request("status", undefined);
			if (!status.ok) throw new Error(status.error.message);
			if (!status.data.ready)
				throw new Error(status.data.error ?? "Player Directory is not ready");
			this.api = api;
			await this.loadDirectory();
			this.clearRetry();
		} catch (error) {
			this.api = null;
			this.setStatus(
				"unavailable",
				error instanceof Error
					? error.message
					: "Player Manager is unavailable",
			);
			this.scheduleRetry();
		}
	}

	private async loadDirectory(): Promise<void> {
		const api = this.api;
		if (!api) throw new Error("Player Manager is unavailable");
		const response = await api.request("list", undefined);
		if (!response.ok) throw new Error(response.error.message);
		const next = new Map<string, Player>();
		for (const player of response.data.players)
			next.set(player.playerId, player);
		this.directory = next;
		this.directoryRevision = response.data.revision;
		this.setStatus("ready", null);
		this.onChange();
	}

	async refresh(): Promise<void> {
		if (this.stopped) return;
		if (this.refreshing) return this.refreshing;
		this.refreshing = (async () => {
			try {
				if (!this.api) {
					await this.connect();
					return;
				}
				await this.loadDirectory();
				this.clearRetry();
			} catch (error) {
				this.setStatus(
					"error",
					error instanceof Error
						? error.message
						: "Failed to refresh Player Manager directory",
				);
				this.scheduleRetry();
			} finally {
				this.refreshing = null;
			}
		})();
		return this.refreshing;
	}

	private scheduleRetry(): void {
		if (this.stopped || this.retryTimer) return;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			void this.connect();
		}, RETRY_DELAY_MS);
	}

	private clearRetry(): void {
		if (!this.retryTimer) return;
		clearTimeout(this.retryTimer);
		this.retryTimer = null;
	}
}

import type NodeCG from "@nodecg/types";
import {BroadcastController} from "./broadcast-controller";

export default function (nodecg: NodeCG.ServerAPI) {
	const controller = new BroadcastController(nodecg);
	void controller.start().catch((error: unknown) => {
		nodecg.log.error(
			`Failed to start race broadcast: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	});
}

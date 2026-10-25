import type {Participant, RaceState} from "@nanahuse/racetime-protocol";

export const currentParticipants = (
	raceState: RaceState | null,
): Participant[] => {
	if (!raceState) return [];
	if (
		raceState.resolution.state === "idle" ||
		raceState.resolution.state === "pending"
	)
		return [];
	if (raceState.resolution.raceRevision !== raceState.raceRevision) return [];
	return raceState.participants;
};

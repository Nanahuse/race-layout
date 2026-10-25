import {createEmptyRacePresentation} from "../../../shared/defaults";
import {REPLICANTS} from "../../../shared/replicants";
import type {RacePresentation} from "../../../shared/types";
import {useReplicant} from "../../hooks/use-replicant";
import {InfoPanel} from "./InfoPanel";
import {PlayerBar} from "./PlayerBar";

export const RaceGraphic = ({variant}: {variant: 4 | 6}) => {
	const presentation =
		useReplicant<RacePresentation>(REPLICANTS.racePresentation) ??
		createEmptyRacePresentation();
	const count = variant === 4 ? 4 : 6;
	const players = Array.from(
		{length: count},
		(_, index) => presentation.players[index] ?? null,
	);

	return (
		<div className={`graphic race race--${variant}`}>
			<div className={`race__bars race__bars--${variant}`}>
				{players.map((player, index) => (
					<PlayerBar
						key={index}
						player={player}
						variant={variant === 4 ? "four" : "six"}
					/>
				))}
			</div>
			<InfoPanel
				info={presentation.info}
				variant={variant === 4 ? "side" : "top"}
			/>
		</div>
	);
};

import type {PlayerBarPresentation, ResultDisplay} from "../../../shared/types";
import {useCycle} from "../../hooks/use-cycle";

type Segment = {
	label: string;
	value: string;
};

const SEGMENT_INTERVAL_MS = 6_500;

const resultText = (result: ResultDisplay): string => {
	if (result.status === "finished") {
		const parts = [];
		if (result.place !== null) parts.push(`#${result.place}`);
		if (result.time) parts.push(result.time);
		return parts.length > 0 ? parts.join(" · ") : "FINISHED";
	}
	if (result.status === "dnf") return "DNF";
	if (result.status === "dq") return "DQ";
	return "OTHER";
};

const buildSegments = (player: PlayerBarPresentation): Segment[] => {
	const segments: Segment[] = [];
	if (player.pb) {
		const place = player.pb.place !== null ? ` · #${player.pb.place}` : "";
		segments.push({label: "PB", value: `${player.pb.time}${place}`});
	}
	if (player.twitch) segments.push({label: "TWITCH", value: player.twitch});
	if (player.youtube) segments.push({label: "YOUTUBE", value: player.youtube});
	if (player.result)
		segments.push({label: "RESULT", value: resultText(player.result)});
	return segments;
};

export const PlayerBar = ({
	player,
	variant,
}: {
	player: PlayerBarPresentation | null;
	variant: "four" | "six";
}) => {
	const segments = player ? buildSegments(player) : [];
	const active = useCycle(segments.length, SEGMENT_INTERVAL_MS);

	if (!player)
		return (
			<div className={`player-bar player-bar--${variant} player-bar--empty`} />
		);

	const segment = segments[active];

	return (
		<div className={`player-bar player-bar--${variant}`}>
			<div
				className='player-bar__name'
				title={player.name}
			>
				{player.name}
			</div>
			<div className='player-bar__info'>
				{segment ? (
					<div
						className='player-bar__segment'
						key={`${segment.label}-${active}`}
					>
						<span className='player-bar__segment-label'>{segment.label}</span>
						<span
							className='player-bar__segment-value'
							title={segment.value}
						>
							{segment.value}
						</span>
					</div>
				) : null}
			</div>
		</div>
	);
};

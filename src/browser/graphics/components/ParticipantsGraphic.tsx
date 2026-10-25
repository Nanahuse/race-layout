import {createEmptyParticipantsPresentation} from "../../../shared/defaults";
import {REPLICANTS} from "../../../shared/replicants";
import type {
	ParticipantPresentation,
	ParticipantsPresentation,
	ResultDisplay,
} from "../../../shared/types";
import {useCycle} from "../../hooks/use-cycle";
import {useReplicant} from "../../hooks/use-replicant";

const PAGE_INTERVAL_MS = 10_000;

const resultText = (result: ResultDisplay): string => {
	if (result.status === "finished") {
		const parts = [];
		if (result.place !== null) parts.push(`#${result.place}`);
		if (result.time) parts.push(result.time);
		return parts.length > 0 ? parts.join(" · ") : "FINISHED";
	}
	return result.status.toUpperCase();
};

const ParticipantCard = ({
	participant,
}: {
	participant: ParticipantPresentation;
}) => (
	<div className='participant-card'>
		<div
			className='participant-card__name'
			title={participant.name}
		>
			{participant.name}
		</div>
		<div className='participant-card__stats'>
			{participant.pb ? (
				<div className='participant-card__stat'>
					<span className='participant-card__stat-label'>PB</span>
					<span className='participant-card__stat-value'>
						{participant.pb.time}
						{participant.pb.place !== null ? ` · #${participant.pb.place}` : ""}
					</span>
				</div>
			) : null}
			{participant.result ? (
				<div className='participant-card__stat'>
					<span className='participant-card__stat-label'>RACE</span>
					<span
						className={`participant-card__stat-value participant-card__stat-value--${participant.result.status}`}
					>
						{resultText(participant.result)}
					</span>
				</div>
			) : null}
		</div>
	</div>
);

export const ParticipantsGraphic = () => {
	const presentation =
		useReplicant<ParticipantsPresentation>(
			REPLICANTS.participantsPresentation,
		) ?? createEmptyParticipantsPresentation();
	const count = presentation.participants.length;
	const columns = count <= 2 ? 1 : count <= 4 ? 2 : count <= 12 ? 3 : 4;
	const rows = Math.max(1, Math.min(5, Math.ceil(count / columns)));
	const perPage = columns * rows;
	const pages = Math.max(1, Math.ceil(count / perPage));
	const page = useCycle(pages, PAGE_INTERVAL_MS);
	const start = page * perPage;
	const visible = presentation.participants.slice(start, start + perPage);
	const raceName = presentation.raceName || "NO RACE";

	return (
		<div className='graphic screen participants-graphic'>
			<div className='screen-panel'>
				<header className='screen-header'>
					<div>
						<div className='screen-kicker'>PARTICIPANTS</div>
						<h1 className='screen-title'>{raceName}</h1>
					</div>
					<div className='screen-meta'>
						<span className='screen-category'>
							{presentation.categoryName || "—"}
						</span>
						<span className='screen-badge'>{presentation.raceStatus}</span>
					</div>
				</header>
				{count > 0 ? (
					<main
						className={`participant-grid participant-grid--cols-${columns}`}
						style={{
							gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
							gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
						}}
					>
						{visible.map((participant) => (
							<ParticipantCard
								key={participant.userId}
								participant={participant}
							/>
						))}
					</main>
				) : (
					<div className='screen-empty'>
						<div className='screen-empty__title'>NO PARTICIPANTS</div>
						<div className='screen-empty__message'>
							Participants will appear when a race is selected.
						</div>
					</div>
				)}
				<footer className='screen-footer'>
					<span>{count} players</span>
					{pages > 1 ? (
						<span>
							{page + 1} / {pages}
						</span>
					) : null}
				</footer>
			</div>
		</div>
	);
};

import {createEmptyLeaderboardPresentation} from "../../../shared/defaults";
import {REPLICANTS} from "../../../shared/replicants";
import type {LeaderboardPresentation} from "../../../shared/types";
import {useCycle} from "../../hooks/use-cycle";
import {useReplicant} from "../../hooks/use-replicant";

const PAGE_INTERVAL_MS = 10_000;
const PAGE_SIZE = 20;

export const LeaderboardGraphic = () => {
	const presentation =
		useReplicant<LeaderboardPresentation>(REPLICANTS.leaderboardPresentation) ??
		createEmptyLeaderboardPresentation();
	const pages = Math.max(1, Math.ceil(presentation.entries.length / PAGE_SIZE));
	const page = useCycle(pages, PAGE_INTERVAL_MS);
	const visible = presentation.entries.slice(
		page * PAGE_SIZE,
		page * PAGE_SIZE + PAGE_SIZE,
	);
	const dense = visible.length > 14;
	const hasEntries = visible.length > 0;
	const title =
		presentation.mappingLabel || presentation.gameName || "SRC LEADERBOARD";
	const subtitle = [presentation.gameName, presentation.categoryName]
		.filter((value, index, values) => value && values.indexOf(value) === index)
		.join(" · ");
	const badge =
		presentation.entries.length > 0
			? "TOP RECORDS"
			: presentation.status === "empty"
				? "NO RECORDS"
				: "NO DATA";

	return (
		<div className='graphic screen leaderboard-graphic'>
			<div className='screen-panel'>
				<header className='screen-header'>
					<div>
						<div className='screen-kicker'>LEADERBOARD</div>
						<h1 className='screen-title'>{title}</h1>
					</div>
					<div className='screen-meta'>
						<span className='screen-category'>{subtitle || "—"}</span>
						<span className='screen-badge'>{badge}</span>
					</div>
				</header>
				{hasEntries ? (
					<div
						className={`leaderboard-table${
							dense ? " leaderboard-table--dense" : ""
						}`}
					>
						<div className='leaderboard-table__head'>
							<span>PLACE</span>
							<span>RUNNERS</span>
							<span>TIME</span>
						</div>
						<div className='leaderboard-table__body'>
							{visible.map((entry, index) => (
								<div
									className={`leaderboard-row${
										entry.place <= 3
											? ` leaderboard-row--podium-${entry.place}`
											: ""
									}`}
									key={`${entry.place}-${entry.players.join("-")}-${index}`}
								>
									<span className='leaderboard-row__place'>{entry.place}</span>
									<span className='leaderboard-row__players'>
										{entry.players.join(" & ")}
									</span>
									<span className='leaderboard-row__time'>{entry.time}</span>
								</div>
							))}
						</div>
					</div>
				) : (
					<div className='screen-empty'>
						<div className='screen-empty__title'>NO RECORDS</div>
						<div className='screen-empty__message'>
							No leaderboard is available for the selected mapping.
						</div>
					</div>
				)}
				<footer className='screen-footer'>
					<span>{presentation.entries.length} runs</span>
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

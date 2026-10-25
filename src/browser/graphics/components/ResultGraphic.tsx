import {createEmptyResultPresentation} from "../../../shared/defaults";
import {REPLICANTS} from "../../../shared/replicants";
import type {ResultPresentation} from "../../../shared/types";
import {useCycle} from "../../hooks/use-cycle";
import {useReplicant} from "../../hooks/use-replicant";

const PAGE_INTERVAL_MS = 10_000;
const PAGE_SIZE = 18;

const statusLabel = (status: string): string => {
	if (status === "dnf") return "DNF";
	if (status === "dq") return "DQ";
	if (status === "other") return "OTHER";
	return "—";
};

export const ResultGraphic = () => {
	const presentation =
		useReplicant<ResultPresentation>(REPLICANTS.resultPresentation) ??
		createEmptyResultPresentation();
	const pages = Math.max(1, Math.ceil(presentation.results.length / PAGE_SIZE));
	const page = useCycle(pages, PAGE_INTERVAL_MS);
	const visible = presentation.results.slice(
		page * PAGE_SIZE,
		page * PAGE_SIZE + PAGE_SIZE,
	);
	const dense = visible.length > 14;
	const hasResults = visible.length > 0;
	const raceName = presentation.raceName || "NO RACE";

	return (
		<div className='graphic screen result-graphic'>
			<div className='screen-panel'>
				<header className='screen-header'>
					<div>
						<div className='screen-kicker'>RESULT</div>
						<h1 className='screen-title'>{raceName}</h1>
					</div>
					<div className='screen-meta'>
						<span className='screen-category'>
							{presentation.categoryName || "—"}
						</span>
						<span className='screen-badge'>{presentation.raceStatus}</span>
					</div>
				</header>
				{hasResults ? (
					<div className={`result-table${dense ? " result-table--dense" : ""}`}>
						<div className='result-table__head'>
							<span>RANK</span>
							<span>PLAYER</span>
							<span>TIME</span>
						</div>
						<div className='result-table__body'>
							{visible.map((result) => (
								<div
									className={`result-row result-row--${result.status}`}
									key={result.userId}
								>
									<span className='result-row__rank'>
										{result.status === "finished" && result.place !== null
											? `#${result.place}`
											: "—"}
									</span>
									<span className='result-row__name'>{result.name}</span>
									<span className='result-row__time'>
										{result.status === "finished"
											? (result.time ?? "—")
											: statusLabel(result.status)}
									</span>
								</div>
							))}
						</div>
					</div>
				) : (
					<div className='screen-empty'>
						<div className='screen-empty__title'>WAITING FOR RESULTS</div>
						<div className='screen-empty__message'>
							Results will appear as runners finish.
						</div>
					</div>
				)}
				<footer className='screen-footer'>
					<span>{presentation.results.length} results</span>
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

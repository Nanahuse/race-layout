import type {CommonInfoPresentation} from "../../../shared/types";

const Field = ({label, value}: {label: string; value: string}) => (
	<div
		className={`info-panel__field${
			label === "TOP RECORD" ? " info-panel__field--record" : ""
		}`}
	>
		<span className='info-panel__label'>{label}</span>
		<span
			className='info-panel__value'
			title={value}
		>
			{value}
		</span>
	</div>
);

export const InfoPanel = ({
	info,
	variant,
}: {
	info: CommonInfoPresentation;
	variant: "side" | "top";
}) => {
	const commentators =
		info.commentators.length > 0 ? info.commentators.join(" / ") : "—";
	const record = info.record;

	return (
		<aside className={`info-panel info-panel--${variant}`}>
			<div className='info-panel__brand'>
				<span className='info-panel__brand-mark'>RACE</span>
				<span className='info-panel__brand-text'>BROADCAST</span>
			</div>
			<div className='info-panel__fields'>
				<Field
					label='EVENT'
					value={info.eventName}
				/>
				<Field
					label='CATEGORY'
					value={info.categoryName}
				/>
				<Field
					label='COMMENTATORS'
					value={commentators}
				/>
				<Field
					label='TOP RECORD'
					value={
						record
							? `${record.time}${record.holder ? ` · ${record.holder}` : ""}`
							: "—"
					}
				/>
			</div>
			<div className='info-panel__status'>
				<span className='info-panel__status-label'>RACE STATUS</span>
				<span className='info-panel__status-value'>{info.raceStatus}</span>
			</div>
		</aside>
	);
};

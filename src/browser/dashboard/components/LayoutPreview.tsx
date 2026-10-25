import type {PersonOption} from "../draft";

const placeholder = (label: string) => (
	<div className='layout-preview__video'>{label}</div>
);

export const LayoutPreview = ({
	variant,
	slots,
	people,
}: {
	variant: 4 | 6;
	slots: Array<string | null>;
	people: PersonOption[];
}) => {
	const count = variant === 4 ? 4 : 6;
	const labels = new Map(people.map((person) => [person.userId, person.label]));
	const bars = Array.from({length: count}, (_, index) => {
		const userId = slots[index];
		return userId ? (labels.get(userId) ?? userId) : "EMPTY";
	});

	return (
		<div className={`layout-preview layout-preview--${variant}`}>
			{variant === 4 ? (
				<>
					<div className='layout-preview__videos layout-preview__videos--4'>
						{Array.from({length: 4}, (_, index) => (
							<div
								className='layout-preview__video'
								key={index}
							>
								VIDEO
							</div>
						))}
					</div>
					<div className='layout-preview__bars layout-preview__bars--4'>
						{bars.map((label, index) => (
							<div
								className='layout-preview__bar'
								key={index}
							>
								<span>{label}</span>
							</div>
						))}
					</div>
					<div className='layout-preview__info layout-preview__info--side'>
						INFO
					</div>
				</>
			) : (
				<>
					<div className='layout-preview__info layout-preview__info--top'>
						INFO PANEL
					</div>
					<div className='layout-preview__videos layout-preview__videos--6'>
						{Array.from({length: 6}, (_, index) => (
							<div
								className='layout-preview__video'
								key={index}
							>
								VIDEO
							</div>
						))}
					</div>
					<div className='layout-preview__bars layout-preview__bars--6'>
						{bars.map((label, index) => (
							<div
								className='layout-preview__bar'
								key={index}
							>
								<span>{label}</span>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
};

export const LayoutPreviewPlaceholder = () => (
	<div className='layout-preview layout-preview--placeholder'>
		{placeholder("LOADING LAYOUT")}
	</div>
);

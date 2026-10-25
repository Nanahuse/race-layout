import {type ReactNode, useCallback, useEffect, useRef, useState} from "react";
import {REPLICANTS} from "../../../shared/replicants";
import type {
	BroadcastConfig,
	BroadcastConfigDraft,
	BroadcastStatus,
	IntegrationState,
	MappingOption,
	ParticipantsPresentation,
	PlayerOption,
	PreviewRace,
} from "../../../shared/types";
import {useReplicant} from "../../hooks/use-replicant";
import {render} from "../../render";
import {
	applyBroadcastConfig,
	listPlayers,
	reconnectRace,
	refreshRaceSnapshot,
	refreshRecords,
	previewRace as requestPreviewRace,
} from "../api";
import {LayoutPreview} from "../components/LayoutPreview";
import {
	addMissingPeople,
	chooseMappingKey,
	draftsEqual,
	fillSlots,
	formatTimestamp,
	moveSlot,
	type PersonOption,
	toDraft,
} from "../draft";
import "../dashboard.css";

const STATE_LABELS: Record<IntegrationState, string> = {
	idle: "IDLE",
	loading: "LOADING",
	ready: "READY",
	error: "ERROR",
	unavailable: "UNAVAILABLE",
};

const errorText = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const Panel = ({
	title,
	className = "",
	children,
}: {
	title: string;
	className?: string;
	children: ReactNode;
}) => (
	<section className={`panel ${className}`}>
		<h2 className='panel__title'>{title}</h2>
		<div className='panel__body'>{children}</div>
	</section>
);

const StatusRow = ({
	label,
	state,
	message,
	detail,
}: {
	label: string;
	state: IntegrationState;
	message: string | null;
	detail?: ReactNode;
}) => (
	<div className='status-row'>
		<div className='status-row__head'>
			<span className='status-row__label'>{label}</span>
			<span className={`state state--${state}`}>{STATE_LABELS[state]}</span>
		</div>
		{detail ? <div className='status-row__detail'>{detail}</div> : null}
		{message ? <div className='status-row__message'>{message}</div> : null}
	</div>
);

const PreviewVariantButton = ({
	active,
	children,
	onClick,
}: {
	active: boolean;
	children: ReactNode;
	onClick: () => void;
}) => (
	<button
		type='button'
		className={`button button--small${active ? " button--active" : ""}`}
		onClick={onClick}
	>
		{children}
	</button>
);

export const BroadcastControl = () => {
	const config = useReplicant<BroadcastConfig>(REPLICANTS.broadcastConfig);
	const status = useReplicant<BroadcastStatus>(REPLICANTS.broadcastStatus);
	const participants = useReplicant<ParticipantsPresentation>(
		REPLICANTS.participantsPresentation,
	);

	const [draft, setDraft] = useState<BroadcastConfigDraft | null>(null);
	const [conflict, setConflict] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [applying, setApplying] = useState(false);
	const [preview, setPreview] = useState<PreviewRace | null>(null);
	const [previewMappings, setPreviewMappings] = useState<MappingOption[]>([]);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewVariant, setPreviewVariant] = useState<4 | 6>(4);
	const [playerOptions, setPlayerOptions] = useState<PlayerOption[]>([]);
	const [playerOptionsError, setPlayerOptionsError] = useState<string | null>(
		null,
	);
	const [playerOptionsLoading, setPlayerOptionsLoading] = useState(false);
	const [commentatorQuery, setCommentatorQuery] = useState("");
	const baselineRef = useRef<BroadcastConfig | null>(null);
	const configRef = useRef<BroadcastConfig | undefined>(undefined);
	const initialPreviewRef = useRef<string | null>(null);
	const previewRequestRef = useRef(0);

	const loadPlayerOptions = useCallback(async () => {
		setPlayerOptionsLoading(true);
		try {
			const response = await listPlayers();
			if (!response.ok) {
				setPlayerOptionsError(response.message);
				return;
			}
			setPlayerOptions(response.players);
			setPlayerOptionsError(null);
		} catch (cause) {
			setPlayerOptionsError(errorText(cause));
		} finally {
			setPlayerOptionsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (status?.playerManager.state !== "ready") return;
		if (playerOptions.length > 0) return;
		void loadPlayerOptions();
	}, [status?.playerManager.state, playerOptions.length, loadPlayerOptions]);

	useEffect(() => {
		if (!config) return;
		const previous = configRef.current;
		configRef.current = config;
		if (!draft) {
			baselineRef.current = config;
			setDraft(toDraft(config));
			return;
		}
		if (!previous || previous.revision === config.revision) return;
		const baseline = baselineRef.current;
		if (baseline && draftsEqual(draft, toDraft(baseline))) {
			baselineRef.current = config;
			setDraft(toDraft(config));
			setConflict(null);
		} else {
			setConflict(
				"設定が別の画面で変更されました。最新の設定を読み込んでから編集してください。",
			);
		}
	}, [config, draft]);

	const loadPreview = useCallback(async (url: string, adoptSlots: boolean) => {
		const requestId = ++previewRequestRef.current;
		const trimmed = url.trim();
		if (!trimmed) {
			setPreviewError("レースURLを入力してください。");
			setPreviewLoading(false);
			return;
		}
		setPreviewLoading(true);
		setPreviewError(null);
		try {
			const response = await requestPreviewRace({url: trimmed});
			if (requestId !== previewRequestRef.current) return;
			if (!response.ok) {
				setPreviewError(response.message);
				return;
			}
			setPreview(response.race);
			setPreviewMappings(response.mappings);
			if (adoptSlots)
				setDraft((current) =>
					current
						? {
								...current,
								raceUrl: response.race.url,
								slots: fillSlots(response.race.entrants),
								mappingKey: chooseMappingKey(
									current.mappingKey,
									response.mappings,
								),
							}
						: current,
				);
		} catch (cause) {
			if (requestId !== previewRequestRef.current) return;
			setPreviewError(errorText(cause));
		} finally {
			if (requestId === previewRequestRef.current) setPreviewLoading(false);
		}
	}, []);

	useEffect(() => {
		const url = config?.raceUrl;
		if (!url || initialPreviewRef.current === url) return;
		initialPreviewRef.current = url;
		void loadPreview(url, false);
	}, [config?.raceUrl, loadPreview]);

	const baseline = baselineRef.current;
	const dirty = Boolean(
		draft && baseline && !draftsEqual(draft, toDraft(baseline)),
	);
	const activeUrl = config?.raceUrl ?? null;
	const draftUrl = draft?.raceUrl ?? null;
	const previewMatches = Boolean(
		preview && draftUrl && preview.url === draftUrl,
	);
	const activeMatches = Boolean(draftUrl && activeUrl === draftUrl);

	let people: PersonOption[] = [];
	if (previewMatches && preview) {
		people = preview.entrants.map((entrant) => ({
			userId: entrant.userId,
			label: entrant.displayName || entrant.name,
		}));
	} else if (activeMatches) {
		people = (participants?.participants ?? []).map((participant) => ({
			userId: participant.userId,
			label: participant.name,
		}));
	}
	const peopleWithSlots = addMissingPeople(people, draft?.slots ?? []);

	const mappingOptions: MappingOption[] = previewMatches
		? previewMappings
		: activeMatches
			? (status?.mappings ?? [])
			: [];
	const mappingKnown = mappingOptions.some(
		(mapping) => mapping.key === draft?.mappingKey,
	);

	const updateDraft = (patch: Partial<BroadcastConfigDraft>) => {
		setDraft((current) => (current ? {...current, ...patch} : current));
		setMessage(null);
		setError(null);
	};

	const updateSlot = (index: number, userId: string | null) => {
		if (!draft) return;
		const slots = [...draft.slots];
		slots[index] = userId || null;
		updateDraft({slots});
	};

	const addCommentator = (playerId: string) => {
		if (!draft || !playerId) return;
		updateDraft({
			commentatorIds: [...new Set([...draft.commentatorIds, playerId])],
		});
		setCommentatorQuery("");
	};

	const removeCommentator = (playerId: string) => {
		if (!draft) return;
		updateDraft({
			commentatorIds: draft.commentatorIds.filter((id) => id !== playerId),
		});
	};

	const apply = async () => {
		if (!draft) return;
		if (conflict) {
			setError("最新の設定を読み込んでから反映してください。");
			return;
		}
		setApplying(true);
		setError(null);
		setMessage(null);
		try {
			const response = await applyBroadcastConfig({
				expectedRevision: baseline?.revision ?? 0,
				config: draft,
			});
			if (!response.ok) {
				setError(response.message);
				if (response.code === "revision_conflict")
					setConflict(response.message);
				return;
			}
			baselineRef.current = response.config;
			configRef.current = response.config;
			setDraft(toDraft(response.config));
			setConflict(null);
			setMessage("配信に反映しました。");
			if (response.config.raceUrl) {
				initialPreviewRef.current = response.config.raceUrl;
				void loadPreview(response.config.raceUrl, false);
			}
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setApplying(false);
		}
	};

	const reloadLatest = () => {
		const current = configRef.current;
		if (!current) return;
		baselineRef.current = current;
		setDraft(toDraft(current));
		setConflict(null);
		setError(null);
		setMessage(null);
		if (current.raceUrl) {
			initialPreviewRef.current = current.raceUrl;
			void loadPreview(current.raceUrl, false);
		}
	};

	const selectRace = (url: string) => {
		setDraft((current) => (current ? {...current, raceUrl: url} : current));
		setMessage(null);
		setError(null);
		void loadPreview(url, true);
	};

	const refresh = async () => {
		setError(null);
		setMessage(null);
		try {
			const response = await refreshRecords();
			if (!response.ok) {
				setError(response.message);
				return;
			}
			setMessage("SRC記録の再取得を開始しました。");
		} catch (cause) {
			setError(errorText(cause));
		}
	};

	const reconnect = async () => {
		setError(null);
		setMessage(null);
		try {
			const response = await reconnectRace();
			if (!response.ok) {
				setError(response.message);
				return;
			}
			setMessage("レース監視を再接続しました。");
		} catch (cause) {
			setError(errorText(cause));
		}
	};

	const refreshSnapshot = async () => {
		setError(null);
		setMessage(null);
		try {
			const response = await refreshRaceSnapshot();
			if (!response.ok) {
				setError(response.message);
				return;
			}
			setMessage("レース結果を再取得しました。");
		} catch (cause) {
			setError(errorText(cause));
		}
	};

	if (!draft || !config) {
		return <div className='dashboard dashboard--loading'>Loading…</div>;
	}

	const effectiveMapping = status?.speedrun.mappingLabel;
	const raceFinished = participants?.raceStatus === "FINISHED";
	const raceSummary = participants?.raceName
		? `${participants.raceName}${
				participants.categoryName ? ` — ${participants.categoryName}` : ""
			}`
		: null;
	const mappingPlaceholder =
		mappingOptions.length === 0
			? "Mappingがありません"
			: mappingOptions.length === 1
				? `自動 (${mappingOptions[0]?.label ?? ""})`
				: "Mappingを選択してください";
	const selectedCommentators = draft.commentatorIds.map((playerId) => ({
		playerId,
		displayName:
			playerOptions.find((option) => option.playerId === playerId)
				?.displayName ?? playerId,
	}));
	const commentatorCandidates = playerOptions
		.filter((option) => !draft.commentatorIds.includes(option.playerId))
		.filter((option) => {
			const query = commentatorQuery.trim().toLocaleLowerCase();
			return (
				query === "" || option.displayName.toLocaleLowerCase().includes(query)
			);
		})
		.slice(0, 50);

	return (
		<div className='dashboard'>
			<header className='dashboard-header'>
				<div className='dashboard-heading'>
					<h1>Broadcast Control</h1>
					<p>編集内容は「配信に反映」を押すまでGraphicsに反映されません。</p>
				</div>
				<div className='dashboard-actions'>
					<span className='revision'>
						Revision {baseline?.revision ?? config.revision}
					</span>
					{dirty ? <span className='dirty'>未反映の変更</span> : null}
					<button
						type='button'
						className='button'
						onClick={reloadLatest}
					>
						最新を読み込む
					</button>
					<button
						type='button'
						className='button button--primary'
						onClick={() => void apply()}
						disabled={!dirty || applying || Boolean(conflict) || previewLoading}
					>
						{applying ? "反映中…" : "配信に反映"}
					</button>
				</div>
			</header>

			{conflict ? (
				<div className='banner banner--warning'>
					<span>{conflict}</span>
					<button
						type='button'
						className='button button--small'
						onClick={reloadLatest}
					>
						最新の設定を読み込む
					</button>
				</div>
			) : null}
			{message ? <div className='banner banner--success'>{message}</div> : null}
			{error ? <div className='banner banner--error'>{error}</div> : null}

			<main className='dashboard-main'>
				<Panel
					title='Race'
					className='panel--race'
				>
					<label className='field'>
						<span className='field__label'>RaceTime URL</span>
						<div className='field__row'>
							<input
								className='input'
								value={draft.raceUrl ?? ""}
								placeholder='https://racetime.gg/...'
								onChange={(event) =>
									updateDraft({raceUrl: event.target.value || null})
								}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										void loadPreview(draft.raceUrl ?? "", true);
									}
								}}
							/>
							<button
								type='button'
								className='button'
								onClick={() => void loadPreview(draft.raceUrl ?? "", true)}
								disabled={previewLoading}
							>
								{previewLoading ? "取得中…" : "レース情報を取得"}
							</button>
						</div>
					</label>
					<p className='field__hint'>
						完走済みレースもURLから取得して表示できます。
					</p>
					{previewError ? (
						<div className='inline-message inline-message--error'>
							{previewError}
						</div>
					) : null}
					{preview && previewMatches ? (
						<div className='race-summary'>
							<strong>{preview.name}</strong>
							<span>
								{preview.categoryName} · {preview.status.toUpperCase()}
							</span>
							<span>{preview.entrants.length} entrants</span>
						</div>
					) : null}
					<div className='subheading'>監視中レース</div>
					{status && status.races.length > 0 ? (
						<div className='race-list'>
							{status.races.map((race) => (
								<button
									type='button'
									className={`race-list__item${
										race.url === activeUrl ? " race-list__item--active" : ""
									}`}
									key={race.url}
									onClick={() => selectRace(race.url)}
								>
									<span className='race-list__name'>{race.name}</span>
									<span className='race-list__meta'>
										{race.category} · {race.status}
									</span>
								</button>
							))}
						</div>
					) : (
						<div className='empty-note'>監視中のレースはありません。</div>
					)}
				</Panel>

				<Panel
					title='Status'
					className='panel--status'
				>
					<StatusRow
						label='RaceTime'
						state={status?.race.state ?? "idle"}
						message={status?.race.message ?? null}
						detail={
							<span>
								{raceFinished
									? `${raceSummary ?? "Race"} · FINISHED`
									: `connection: ${status?.race.connection ?? "—"}`}
								{!raceFinished && status?.race.raceId
									? ` · ${status.race.raceId}`
									: ""}
							</span>
						}
					/>
					{raceFinished ? (
						<div className='status-note'>
							レース終了・取得済みデータを表示中。結果をGraphicsに表示できます。
						</div>
					) : null}
					<StatusRow
						label='Player Manager'
						state={status?.playerManager.state ?? "idle"}
						message={status?.playerManager.message ?? null}
					/>
					<StatusRow
						label='Speedrun.com'
						state={status?.speedrun.state ?? "idle"}
						message={status?.speedrun.message ?? null}
						detail={
							<span>
								{effectiveMapping ?? "Mapping未選択"}
								{status?.speedrun.fetchedAt
									? ` · ${formatTimestamp(status.speedrun.fetchedAt)}`
									: ""}
								{status?.speedrun.stale ? " · STALE" : ""}
							</span>
						}
					/>
					<div className='status-actions'>
						<button
							type='button'
							className='button'
							onClick={() => void refresh()}
						>
							記録を再取得
						</button>
						<button
							type='button'
							className='button'
							onClick={() =>
								void (raceFinished ? refreshSnapshot() : reconnect())
							}
							disabled={!activeUrl}
						>
							{raceFinished ? "結果を再取得" : "監視を再接続"}
						</button>
					</div>
					<div className='status-updated'>
						Updated {formatTimestamp(status?.updatedAt ?? null)}
					</div>
				</Panel>

				<Panel
					title='Layout'
					className='panel--wide panel--layout'
				>
					<div className='layout-grid'>
						<div className='slot-editor'>
							<div className='slot-actions'>
								<button
									type='button'
									className='button button--small'
									onClick={() =>
										updateDraft({
											slots: Array.from(
												{length: 6},
												(_, index) => peopleWithSlots[index]?.userId ?? null,
											),
										})
									}
									disabled={peopleWithSlots.length === 0}
								>
									参加者で埋める
								</button>
								<button
									type='button'
									className='button button--small'
									onClick={() =>
										updateDraft({
											slots: Array.from({length: 6}, () => null),
										})
									}
								>
									クリア
								</button>
							</div>
							<div className='slot-list'>
								{draft.slots.map((userId, index) => {
									const usedElsewhere = new Set(
										draft.slots.filter(
											(slot, slotIndex) => slotIndex !== index && slot,
										),
									);
									return (
										<div
											className='slot'
											key={index}
										>
											<span className='slot__number'>Slot {index + 1}</span>
											<select
												className='input slot__select'
												value={userId ?? ""}
												onChange={(event) =>
													updateSlot(index, event.target.value || null)
												}
											>
												<option value=''>未配置</option>
												{peopleWithSlots.map((person) => (
													<option
														value={person.userId}
														key={person.userId}
														disabled={usedElsewhere.has(person.userId)}
													>
														{person.label}
													</option>
												))}
											</select>
											<div className='slot__buttons'>
												<button
													type='button'
													className='icon-button'
													onClick={() =>
														updateDraft({
															slots: moveSlot(draft.slots, index, -1),
														})
													}
													disabled={index === 0}
													aria-label={`Slot ${index + 1}を上へ`}
												>
													↑
												</button>
												<button
													type='button'
													className='icon-button'
													onClick={() =>
														updateDraft({
															slots: moveSlot(draft.slots, index, 1),
														})
													}
													disabled={index === draft.slots.length - 1}
													aria-label={`Slot ${index + 1}を下へ`}
												>
													↓
												</button>
											</div>
										</div>
									);
								})}
							</div>
							{peopleWithSlots.length === 0 ? (
								<div className='empty-note'>
									レース情報を取得すると参加者を選択できます。
								</div>
							) : null}
						</div>
						<div className='preview-column'>
							<div className='preview-toolbar'>
								<span className='field__label'>プレビュー</span>
								<div className='preview-toolbar__buttons'>
									<PreviewVariantButton
										active={previewVariant === 4}
										onClick={() => setPreviewVariant(4)}
									>
										4人
									</PreviewVariantButton>
									<PreviewVariantButton
										active={previewVariant === 6}
										onClick={() => setPreviewVariant(6)}
									>
										6人
									</PreviewVariantButton>
								</div>
							</div>
							<LayoutPreview
								variant={previewVariant}
								slots={draft.slots}
								people={peopleWithSlots}
							/>
							<p className='preview-note'>
								プレビューは配置確認用です。OBSのシーンは切り替えません。
							</p>
						</div>
					</div>
				</Panel>

				<Panel
					title='Presentation'
					className='panel--wide'
				>
					<div className='presentation-grid'>
						<label className='field'>
							<span className='field__label'>Event</span>
							<input
								className='input'
								value={draft.eventName}
								placeholder='空欄ならレース名を使用'
								onChange={(event) =>
									updateDraft({eventName: event.target.value})
								}
							/>
						</label>
						<label className='field'>
							<span className='field__label'>Category</span>
							<input
								className='input'
								value={draft.categoryName}
								placeholder='空欄ならRaceTimeカテゴリを使用'
								onChange={(event) =>
									updateDraft({categoryName: event.target.value})
								}
							/>
						</label>
						<div className='field field--wide'>
							<span className='field__label'>Commentators</span>
							{selectedCommentators.length > 0 ? (
								<div className='chip-list'>
									{selectedCommentators.map((commentator) => (
										<span
											className='chip'
											key={commentator.playerId}
										>
											<span className='chip__label'>
												{commentator.displayName}
											</span>
											<button
												type='button'
												className='chip__remove'
												onClick={() => removeCommentator(commentator.playerId)}
												aria-label={`${commentator.displayName}を削除`}
											>
												×
											</button>
										</span>
									))}
								</div>
							) : (
								<span className='field__hint'>
									実況者はまだ選択されていません。
								</span>
							)}
							<div className='commentator-picker'>
								<input
									className='input'
									value={commentatorQuery}
									placeholder='実況者を検索'
									onChange={(event) => setCommentatorQuery(event.target.value)}
								/>
								<select
									className='input'
									value=''
									onChange={(event) => addCommentator(event.target.value)}
									disabled={
										playerOptionsLoading || commentatorCandidates.length === 0
									}
								>
									<option value=''>
										{playerOptionsLoading
											? "読み込み中…"
											: commentatorCandidates.length > 0
												? "Player Managerから実況者を追加"
												: "候補がありません"}
									</option>
									{commentatorCandidates.map((option) => (
										<option
											value={option.playerId}
											key={option.playerId}
										>
											{option.displayName}
										</option>
									))}
								</select>
							</div>
							{playerOptionsError ? (
								<span className='field__hint field__hint--error'>
									{playerOptionsError}
								</span>
							) : null}
							{status?.playerManager.state !== "ready" ? (
								<span className='field__hint'>
									Player Managerの準備ができていません。
								</span>
							) : null}
						</div>
						<label className='field'>
							<span className='field__label'>SRC Mapping</span>
							<select
								className='input'
								value={draft.mappingKey ?? ""}
								onChange={(event) =>
									updateDraft({mappingKey: event.target.value || null})
								}
							>
								<option value=''>{mappingPlaceholder}</option>
								{mappingOptions.map((mapping) => (
									<option
										value={mapping.key}
										key={mapping.key}
									>
										{mapping.label}
									</option>
								))}
								{draft.mappingKey && !mappingKnown ? (
									<option value={draft.mappingKey}>
										選択中のMapping（現在のレースでは利用不可）
									</option>
								) : null}
							</select>
							<span className='field__hint'>
								{status?.speedrun.effectiveMappingKey
									? `表示中: ${
											effectiveMapping ?? status.speedrun.effectiveMappingKey
										}`
									: "Mappingが複数ある場合は表示対象を選択してください。"}
							</span>
						</label>
						<div className='field'>
							<span className='field__label'>設定の状態</span>
							<div className='config-summary'>
								<span>Event: {draft.eventName || "(RaceTime)"}</span>
								<span>Category: {draft.categoryName || "(RaceTime)"}</span>
								<span>Commentators: {draft.commentatorIds.length}</span>
								<span>
									Mapping: {draft.mappingKey ? "選択済み" : "自動 / 未選択"}
								</span>
							</div>
						</div>
					</div>
					<div className='default-note'>
						空欄のEvent / CategoryはRaceTimeのレース情報から補完されます。
					</div>
				</Panel>
			</main>
		</div>
	);
};

render(<BroadcastControl />);

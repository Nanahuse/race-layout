import {
	type BroadcastConfig,
	type BroadcastConfigDraft,
	SLOT_COUNT,
} from "./types";

const MAX_NAME_LENGTH = 200;
const MAX_COMMENTATORS = 20;
const MAX_COMMENTATOR_LENGTH = 100;
const MAX_MAPPING_KEY_LENGTH = 500;
const MAX_USER_ID_LENGTH = 200;

type RawConfig = {
	raceUrl?: unknown;
	slots?: unknown;
	eventName?: unknown;
	categoryName?: unknown;
	commentators?: unknown;
	mappingKey?: unknown;
	revision?: unknown;
};

const isRecord = (value: unknown): value is RawConfig =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown, field: string, maxLength: number): string => {
	if (typeof value !== "string") throw new Error(`${field} must be a string`);
	const trimmed = value.trim();
	if (trimmed.length > maxLength)
		throw new Error(`${field} must be at most ${maxLength} characters`);
	return trimmed;
};

export const normalizeRaceUrl = (value: string): string => {
	const trimmed = value.trim();
	if (trimmed === "") return "";
	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new Error("Race URL must be a valid URL");
	}
	if (url.protocol !== "https:" && url.protocol !== "http:")
		throw new Error("Race URL must use http or https");
	if (url.username || url.password)
		throw new Error("Race URL must not contain credentials");
	return trimmed;
};

export const validateBroadcastConfigDraft = (
	raw: unknown,
): BroadcastConfigDraft => {
	if (!isRecord(raw)) throw new Error("Broadcast config must be an object");

	const raceUrlValue = raw.raceUrl;
	let raceUrl: string | null = null;
	if (raceUrlValue !== null && raceUrlValue !== undefined) {
		if (typeof raceUrlValue !== "string")
			throw new Error("raceUrl must be a string or null");
		const normalized = normalizeRaceUrl(raceUrlValue);
		raceUrl = normalized === "" ? null : normalized;
	}

	if (!Array.isArray(raw.slots) || raw.slots.length !== SLOT_COUNT)
		throw new Error(`slots must contain exactly ${SLOT_COUNT} entries`);
	const seen = new Set<string>();
	const slots = raw.slots.map((value, index) => {
		if (value === null || value === undefined) return null;
		if (typeof value !== "string")
			throw new Error(`slots[${index}] must be a string or null`);
		const trimmed = value.trim();
		if (trimmed === "") return null;
		if (trimmed.length > MAX_USER_ID_LENGTH)
			throw new Error(`slots[${index}] is too long`);
		if (seen.has(trimmed))
			throw new Error("Each participant can only be placed once");
		seen.add(trimmed);
		return trimmed;
	});

	const eventName = text(raw.eventName ?? "", "eventName", MAX_NAME_LENGTH);
	const categoryName = text(
		raw.categoryName ?? "",
		"categoryName",
		MAX_NAME_LENGTH,
	);

	if (!Array.isArray(raw.commentators))
		throw new Error("commentators must be an array");
	if (raw.commentators.length > MAX_COMMENTATORS)
		throw new Error(
			`commentators must contain at most ${MAX_COMMENTATORS} entries`,
		);
	const commentators: string[] = [];
	for (const [index, value] of raw.commentators.entries()) {
		if (typeof value !== "string")
			throw new Error(`commentators[${index}] must be a string`);
		const trimmed = value.trim();
		if (trimmed === "") continue;
		if (trimmed.length > MAX_COMMENTATOR_LENGTH)
			throw new Error(`commentators[${index}] is too long`);
		if (!commentators.includes(trimmed)) commentators.push(trimmed);
	}

	let mappingKey: string | null = null;
	if (raw.mappingKey !== null && raw.mappingKey !== undefined) {
		if (typeof raw.mappingKey !== "string")
			throw new Error("mappingKey must be a string or null");
		const trimmed = raw.mappingKey.trim();
		if (trimmed.length > MAX_MAPPING_KEY_LENGTH)
			throw new Error("mappingKey is too long");
		mappingKey = trimmed === "" ? null : trimmed;
	}

	return {
		raceUrl,
		slots,
		eventName,
		categoryName,
		commentators,
		mappingKey,
	};
};

export const parseBroadcastConfig = (raw: unknown): BroadcastConfig => {
	if (!isRecord(raw)) throw new Error("Broadcast config must be an object");
	const revision = raw.revision;
	if (
		typeof revision !== "number" ||
		!Number.isSafeInteger(revision) ||
		revision < 0
	)
		throw new Error("revision must be a non-negative integer");
	return {
		...validateBroadcastConfigDraft(raw),
		revision,
	};
};

export const broadcastConfigsEqual = (
	left: BroadcastConfigDraft,
	right: BroadcastConfigDraft,
): boolean =>
	JSON.stringify(validateBroadcastConfigDraft(left)) ===
	JSON.stringify(validateBroadcastConfigDraft(right));

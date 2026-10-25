import type {PreviewRace} from "../../shared/types";
import {
	type BroadcastConfig,
	type BroadcastConfigDraft,
	type MappingOption,
	SLOT_COUNT,
} from "../../shared/types";

export type PersonOption = {
	userId: string;
	label: string;
};

export const toDraft = (config: BroadcastConfig): BroadcastConfigDraft => ({
	raceUrl: config.raceUrl,
	slots: [...config.slots],
	eventName: config.eventName,
	categoryName: config.categoryName,
	commentators: [...config.commentators],
	mappingKey: config.mappingKey,
});

export const draftsEqual = (
	left: BroadcastConfigDraft,
	right: BroadcastConfigDraft,
): boolean => JSON.stringify(left) === JSON.stringify(right);

export const fillSlots = (
	entrants: PreviewRace["entrants"],
): Array<string | null> => {
	const slots: Array<string | null> = entrants
		.slice(0, SLOT_COUNT)
		.map((entrant) => entrant.userId);
	while (slots.length < SLOT_COUNT) slots.push(null);
	return slots;
};

export const moveSlot = (
	slots: Array<string | null>,
	index: number,
	direction: -1 | 1,
): Array<string | null> => {
	const target = index + direction;
	if (target < 0 || target >= slots.length) return slots;
	const next = [...slots];
	const current = next[index] ?? null;
	next[index] = next[target] ?? null;
	next[target] = current;
	return next;
};

export const chooseMappingKey = (
	currentKey: string | null,
	mappings: MappingOption[],
): string | null => {
	if (currentKey && mappings.some((mapping) => mapping.key === currentKey))
		return currentKey;
	return mappings.length === 1 ? (mappings[0]?.key ?? null) : null;
};

export const addMissingPeople = (
	people: PersonOption[],
	slots: Array<string | null>,
): PersonOption[] => {
	const result = [...people];
	const known = new Set(result.map((person) => person.userId));
	for (const userId of slots) {
		if (!userId || known.has(userId)) continue;
		known.add(userId);
		result.push({userId, label: userId});
	}
	return result;
};

export const formatTimestamp = (value: string | null): string => {
	if (!value) return "—";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return date.toLocaleTimeString();
};

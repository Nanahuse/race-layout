import {parseRaceDuration} from "@nanahuse/racetime-protocol";

const NANOSECONDS_PER_HOUR = 3_600_000_000_000;
const NANOSECONDS_PER_MINUTE = 60_000_000_000;
const NANOSECONDS_PER_SECOND = 1_000_000_000;

const pad = (value: number, length = 2): string =>
	String(value).padStart(length, "0");

export const formatElapsed = (
	value: string | null,
	fractionDigits: 1 | 3 = 3,
): string | null => {
	if (value === null) return null;
	try {
		const duration = parseRaceDuration(value);
		if (!duration) return null;
		const totalNanoseconds = duration.total({unit: "nanoseconds"});
		if (!Number.isFinite(totalNanoseconds) || totalNanoseconds < 0) return null;
		const factor = 10 ** (9 - fractionDigits);
		const rounded = Math.round(totalNanoseconds / factor) * factor;
		const hours = Math.floor(rounded / NANOSECONDS_PER_HOUR);
		const afterHours = rounded - hours * NANOSECONDS_PER_HOUR;
		const minutes = Math.floor(afterHours / NANOSECONDS_PER_MINUTE);
		const afterMinutes = afterHours - minutes * NANOSECONDS_PER_MINUTE;
		const seconds = Math.floor(afterMinutes / NANOSECONDS_PER_SECOND);
		const fraction = Math.floor(
			(afterMinutes - seconds * NANOSECONDS_PER_SECOND) / factor,
		);
		const suffix = `${pad(seconds)}.${pad(fraction, fractionDigits)}`;
		return hours > 0
			? `${hours}:${pad(minutes)}:${suffix}`
			: `${minutes}:${suffix}`;
	} catch {
		return null;
	}
};

export const formatRaceStatus = (status: string | null | undefined): string => {
	if (!status) return "NO RACE";
	const labels: Record<string, string> = {
		open: "OPEN",
		invitational: "INVITATIONAL",
		pending: "PENDING",
		in_progress: "IN PROGRESS",
		finished: "FINISHED",
		cancelled: "CANCELLED",
	};
	return labels[status] ?? status.replaceAll("_", " ").toUpperCase();
};

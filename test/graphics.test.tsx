import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {LeaderboardGraphic} from "../src/browser/graphics/components/LeaderboardGraphic";
import {ParticipantsGraphic} from "../src/browser/graphics/components/ParticipantsGraphic";
import {RaceGraphic} from "../src/browser/graphics/components/RaceGraphic";
import {ResultGraphic} from "../src/browser/graphics/components/ResultGraphic";
import {
	createEmptyLeaderboardPresentation,
	createEmptyParticipantsPresentation,
	createEmptyRacePresentation,
	createEmptyResultPresentation,
} from "../src/shared/defaults";
import {REPLICANTS} from "../src/shared/replicants";

const setReplicants = (values: Record<string, unknown>) => {
	(globalThis as {nodecg?: unknown}).nodecg = {
		Replicant: (name: string) => ({
			value: values[name],
			on: () => {},
			removeListener: () => {},
		}),
	};
};

const racePresentation = () => {
	const presentation = createEmptyRacePresentation();
	presentation.raceName = "Test Race";
	presentation.players = Array.from({length: 6}, (_, index) =>
		index < 4
			? {
					userId: `rt-${index + 1}`,
					name: `Racer ${index + 1}`,
					pb: {time: `1:0${index}.000`, place: index + 1},
					twitch: `twitch.tv/racer${index + 1}`,
					youtube: null,
					result:
						index === 0
							? {place: 1, time: "1:23.4", status: "finished" as const}
							: null,
				}
			: null,
	);
	presentation.info = {
		eventName: "Test Race",
		categoryName: "Any%",
		commentators: ["Commentator"],
		raceStatus: "IN PROGRESS",
		record: {label: "TOP RECORD", time: "0:50.000", holder: "Runner"},
	};
	return presentation;
};

describe("race graphic", () => {
	it("renders four bars and the common information panel", () => {
		setReplicants({[REPLICANTS.racePresentation]: racePresentation()});
		const markup = renderToStaticMarkup(<RaceGraphic variant={4} />);
		expect(markup).toContain("Racer 1");
		expect(markup).toContain("Racer 4");
		expect(markup).not.toContain("Racer 5");
		expect(markup).toContain("TOP RECORD");
		expect(markup).toContain("0:50.000");
		expect(markup).toContain("IN PROGRESS");
		expect(markup).not.toContain("P1");
	});

	it("renders six bars for the six-player layout", () => {
		const presentation = racePresentation();
		presentation.players[4] = {
			userId: "rt-5",
			name: "Racer 5",
			pb: null,
			twitch: null,
			youtube: null,
			result: null,
		};
		presentation.players[5] = {
			userId: "rt-6",
			name: "Racer 6",
			pb: null,
			twitch: null,
			youtube: null,
			result: null,
		};
		setReplicants({[REPLICANTS.racePresentation]: presentation});
		const markup = renderToStaticMarkup(<RaceGraphic variant={6} />);
		expect(markup).toContain("Racer 5");
		expect(markup).toContain("Racer 6");
	});
});

describe("participants graphic", () => {
	it("renders participant names, PBs and race results", () => {
		const presentation = createEmptyParticipantsPresentation();
		presentation.raceName = "Test Race";
		presentation.categoryName = "Any%";
		presentation.raceStatus = "FINISHED";
		presentation.participants = [
			{
				userId: "rt-1",
				name: "Racer 1",
				playerId: "p1",
				pb: {time: "1:00.000", place: 2},
				result: {place: 1, time: "1:23.4", status: "finished"},
			},
			{
				userId: "rt-2",
				name: "Racer 2",
				playerId: null,
				pb: null,
				result: {place: null, time: null, status: "dnf"},
			},
		];
		setReplicants({[REPLICANTS.participantsPresentation]: presentation});
		const markup = renderToStaticMarkup(<ParticipantsGraphic />);
		expect(markup).toContain("Racer 1");
		expect(markup).toContain("Racer 2");
		expect(markup).toContain("1:00.000");
		expect(markup).toContain("#2");
		expect(markup).toContain("DNF");
	});
});

describe("leaderboard graphic", () => {
	it("preserves places and supports multiple runners", () => {
		const presentation = createEmptyLeaderboardPresentation();
		presentation.mappingLabel = "Any%";
		presentation.gameName = "Test Game";
		presentation.categoryName = "Any%";
		presentation.status = "ready";
		presentation.entries = [
			{place: 1, time: "0:50.000", players: ["Runner A", "Runner B"]},
			{place: 2, time: "1:00.000", players: ["Runner C"]},
		];
		setReplicants({[REPLICANTS.leaderboardPresentation]: presentation});
		const markup = renderToStaticMarkup(<LeaderboardGraphic />);
		expect(markup).toContain("Runner A &amp; Runner B");
		expect(markup).toContain("0:50.000");
		expect(markup).toContain("2");
	});
});

describe("result graphic", () => {
	it("renders one-decimal times and DNF states", () => {
		const presentation = createEmptyResultPresentation();
		presentation.raceName = "Test Race";
		presentation.categoryName = "Any%";
		presentation.raceStatus = "FINISHED";
		presentation.results = [
			{
				userId: "rt-1",
				name: "Racer 1",
				place: 1,
				time: "1:23.4",
				status: "finished",
			},
			{
				userId: "rt-2",
				name: "Racer 2",
				place: null,
				time: null,
				status: "dnf",
			},
		];
		setReplicants({[REPLICANTS.resultPresentation]: presentation});
		const markup = renderToStaticMarkup(<ResultGraphic />);
		expect(markup).toContain("1:23.4");
		expect(markup).toContain("DNF");
		expect(markup).toContain("Racer 2");
	});
});

import { describe, expect, it } from "vitest";
import {
    comboBonus,
    eligibleCandidates,
    grantFromEvents,
    homeworkPoints,
    isTopicComplete,
    isValidWeekKey,
    leaderboardWeekKey,
    secondsIntoWeek,
    nextWeekKey,
    previousWeekKey,
    rankEntries,
    rankKey,
    scoringAttemptsExhausted,
    weekDateKeys,
    weekEndMillis,
    weekLabel,
    weekStartMillis,
    MAX_SCORING_ATTEMPTS_PER_WEEK,
} from "@/lib/leaderboard";
import { contentNotification, resultsNotification, rewardNotification } from "@/lib/notifications";

describe("leaderboard weeks", () => {
    it("names the week by its Monday in Pakistan time and resets at Monday midnight", () => {
        // Sunday 11 Oct 2026 23:30 in Karachi is still the week of Monday 5 Oct.
        expect(leaderboardWeekKey(new Date("2026-10-11T18:30:00Z"))).toBe("2026-10-05");
        // Half an hour later it is Monday 12 Oct in Karachi, although still Sunday in UTC.
        expect(leaderboardWeekKey(new Date("2026-10-11T19:00:00Z"))).toBe("2026-10-12");
        expect(leaderboardWeekKey(new Date("2026-10-07T09:00:00Z"))).toBe("2026-10-05");
    });

    it("walks weeks, lists their days and knows their boundaries", () => {
        expect(previousWeekKey("2026-10-12")).toBe("2026-10-05");
        expect(nextWeekKey("2026-10-05")).toBe("2026-10-12");
        expect(weekDateKeys("2026-10-05")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"]);
        expect(new Date(weekStartMillis("2026-10-05")).toISOString()).toBe("2026-10-04T19:00:00.000Z");
        expect(weekEndMillis("2026-10-05")).toBe(weekStartMillis("2026-10-12"));
        expect(weekLabel("2026-10-05")).toBe("5 – 11 Oct 2026");
        expect(weekLabel("2026-09-28")).toBe("28 Sep – 4 Oct 2026");
    });

    it("accepts only Monday dates as week keys", () => {
        expect(isValidWeekKey("2026-10-05")).toBe(true);
        expect(isValidWeekKey("2026-10-06")).toBe(false);
        expect(isValidWeekKey("2026-13-01")).toBe(false);
        expect(isValidWeekKey("nope")).toBe(false);
    });
});

describe("ranking", () => {
    it("orders by points, then correct answers, then who got there first", () => {
        const week = "2026-10-05";
        const early = secondsIntoWeek(new Date("2026-10-05T05:00:00Z"), week);
        const late = secondsIntoWeek(new Date("2026-10-05T05:00:01Z"), week);
        expect(early).toBeLessThan(late);
        const entries = [
            { uid: "b", rankKey: rankKey(30, 12, late) },
            { uid: "a", rankKey: rankKey(30, 12, early) },
            { uid: "c", rankKey: rankKey(30, 15, late) },
            { uid: "d", rankKey: rankKey(31, 1, late) },
        ];
        expect(rankEntries(entries).map((entry) => `${entry.rank}:${entry.uid}`)).toEqual(["1:d", "2:c", "3:a", "4:b"]);
    });

    it("keeps a rank key exact for large scores", () => {
        const key = rankKey(250_000, 90_000, 604_799);
        expect(Number.isSafeInteger(key)).toBe(true);
        expect(rankKey(1, 0, 0)).toBeGreaterThan(rankKey(0, 9_999, 0));
        expect(rankKey(0, 9_999, 0)).toBeGreaterThan(rankKey(0, 9_998, 0));
        expect(secondsIntoWeek(new Date("2020-01-01T00:00:00Z"), "2026-10-05")).toBe(0);
        expect(rankKey(5, 2, 10)).toBeGreaterThan(rankKey(5, 2, 11));
    });
});

describe("bonus points", () => {
    const answer = (isCorrect: boolean, extra: { practice?: boolean; foundation?: boolean } = {}) => ({ isCorrect, ...extra });

    it("pays one point for every three correct answers in a row on the lesson's own questions", () => {
        expect(comboBonus([answer(true), answer(true), answer(true)])).toBe(1);
        expect(comboBonus([answer(true), answer(true), answer(false), answer(true), answer(true), answer(true)])).toBe(1);
        expect(comboBonus(Array.from({ length: 7 }, () => answer(true)))).toBe(2);
        expect(comboBonus([answer(true), answer(true), answer(true, { practice: true }), answer(true)])).toBe(1);
        expect(comboBonus([answer(true), answer(false, { foundation: true }), answer(true), answer(true)])).toBe(1);
        expect(comboBonus([])).toBe(0);
    });

    it("scores homework by accuracy", () => {
        expect(homeworkPoints(100)).toBe(10);
        expect(homeworkPoints(45)).toBe(5);
        expect(homeworkPoints(0)).toBe(0);
        expect(homeworkPoints(140)).toBe(10);
        expect(homeworkPoints(Number.NaN)).toBe(0);
    });

    it("completes a chapter only when every lesson is mastered, counting the one just finished", () => {
        const lessons = [{ microTag: "a", mastered: true }, { microTag: "b", mastered: false }, { microTag: "c", mastered: true }];
        expect(isTopicComplete(lessons, "b")).toBe(true);
        expect(isTopicComplete(lessons, "a")).toBe(false);
        expect(isTopicComplete([], "a")).toBe(false);
        expect(isTopicComplete([{ microTag: "x", mastered: true }], "a")).toBe(false);
    });

    it("caps scoring days per topic per week and sums a grant", () => {
        expect(scoringAttemptsExhausted(MAX_SCORING_ATTEMPTS_PER_WEEK - 1)).toBe(false);
        expect(scoringAttemptsExhausted(MAX_SCORING_ATTEMPTS_PER_WEEK)).toBe(true);
        const grant = grantFromEvents([
            { id: "quiz_s1", kind: "quiz", points: 14, correctAnswers: 4, label: "Sets" },
            { id: "combo_s1", kind: "combo", points: 1, correctAnswers: 0, label: "Sets" },
        ]);
        expect(grant).toMatchObject({ points: 15, correctAnswers: 4 });
    });
});

describe("rewards and notifications", () => {
    it("suggests the top three paid, unflagged students in board order", () => {
        const candidate = (uid: string, rank: number, flags: Partial<{ paid: boolean; banned: boolean; suspicious: boolean }> = {}) =>
            ({ uid, name: uid, rank, points: 100 - rank, correctAnswers: 0, paid: true, banned: false, suspicious: false, ...flags });
        const picked = eligibleCandidates([
            candidate("c", 3), candidate("a", 1, { paid: false }), candidate("b", 2, { suspicious: true }),
            candidate("d", 4), candidate("e", 5, { banned: true }), candidate("f", 6), candidate("g", 7),
        ]);
        expect(picked.map((item) => item.uid)).toEqual(["c", "d", "f"]);
    });

    it("writes notifications with stable ids and links", () => {
        const content = contentNotification({ microTag: "c6-sets-intro", title: { english: "Introduction to sets", romanUrdu: "" }, classLevel: 6 }, "2026-10-11");
        expect(content.id).toBe("content_c6-sets-intro_2026-10-11");
        expect(content.link).toBe("/learn?microTag=c6-sets-intro&class=6");
        expect(content.body.english).toContain("Introduction to sets");
        const results = resultsNotification("2026-10-05", { rank: 4, points: 37, participants: 12 });
        expect(results.id).toBe("leaderboard_2026-10-05");
        expect(results.body.english).toContain("#4 of 12");
        expect(rewardNotification("2026-10-05", 2).body.english).toContain("2nd");
    });
});

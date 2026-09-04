import { describe, expect, it } from "vitest";
import {
    activityDateKey,
    answerXp,
    daysBetween,
    evaluateBadges,
    newlyEarnedBadges,
    nextStreak,
    XP_FIRST_ATTEMPT_CORRECT,
    XP_QUIZ_COMPLETED,
} from "@/lib/gamification";
import { sessionXp } from "@/lib/assessment-session";

describe("experience points", () => {
    it("rewards only unaided correct answers", () => {
        expect(answerXp({ isCorrect: true, hintUsed: false })).toBe(XP_FIRST_ATTEMPT_CORRECT);
        expect(answerXp({ isCorrect: true, hintUsed: true })).toBe(0);
        expect(answerXp({ isCorrect: false, hintUsed: false })).toBe(0);
        expect(answerXp({ isCorrect: false, hintUsed: true })).toBe(0);
    });

    it("adds the completion bonus to unaided correct answers and ignores practice questions", () => {
        const answer = (isCorrect: boolean, hintUsed = false, practice = false) => ({
            eventId: "e", questionId: "q", microTag: "m", difficulty: "easy" as const,
            optionId: "A", isCorrect, scoreDelta: 0, answeredAt: new Date(0), hintUsed, practice,
        });
        const xp = sessionXp({ answers: [answer(true), answer(true), answer(true, true), answer(false), answer(true, false, true)] });
        expect(xp).toBe(XP_QUIZ_COMPLETED + 2 * XP_FIRST_ATTEMPT_CORRECT);
    });
});

describe("daily streaks", () => {
    it("formats and compares activity days", () => {
        expect(activityDateKey(new Date("2026-09-04T12:00:00Z"), "UTC")).toBe("2026-09-04");
        expect(daysBetween("2026-09-04", "2026-09-05")).toBe(1);
        expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
    });

    it("starts a streak on the first activity", () => {
        expect(nextStreak(null, "2026-09-04")).toEqual({ current: 1, longest: 1, lastActivityDate: "2026-09-04" });
    });

    it("is idempotent within the same day", () => {
        const first = nextStreak(null, "2026-09-04");
        expect(nextStreak(first, "2026-09-04")).toEqual(first);
    });

    it("extends on a consecutive day and tracks the longest run", () => {
        const day1 = nextStreak(null, "2026-09-04");
        const day2 = nextStreak(day1, "2026-09-05");
        expect(day2).toEqual({ current: 2, longest: 2, lastActivityDate: "2026-09-05" });
    });

    it("restarts after a missed day but keeps the longest run", () => {
        const restarted = nextStreak({ current: 6, longest: 6, lastActivityDate: "2026-09-01" }, "2026-09-04");
        expect(restarted).toEqual({ current: 1, longest: 6, lastActivityDate: "2026-09-04" });
    });
});

describe("badges", () => {
    const stats = { lessonsCompleted: 0, quizzesCompleted: 0, questionsAnswered: 0, currentStreak: 0 };

    it("awards milestone badges as thresholds are reached", () => {
        expect(evaluateBadges(stats)).toEqual([]);
        expect(evaluateBadges({ ...stats, lessonsCompleted: 1 })).toContain("first-lesson");
        expect(evaluateBadges({ ...stats, quizzesCompleted: 1 })).toContain("first-quiz");
        expect(evaluateBadges({ ...stats, currentStreak: 7 })).toContain("seven-day-streak");
        expect(evaluateBadges({ ...stats, questionsAnswered: 50 })).toContain("fifty-practice-questions");
        expect(evaluateBadges({ ...stats, quizzesCompleted: 10 })).toContain("ten-quizzes");
    });

    it("does not award a badge twice", () => {
        const earned = { ...stats, quizzesCompleted: 10, questionsAnswered: 50 };
        expect(newlyEarnedBadges(earned, [])).toEqual(["first-quiz", "fifty-practice-questions", "ten-quizzes"]);
        expect(newlyEarnedBadges(earned, ["first-quiz", "fifty-practice-questions", "ten-quizzes"])).toEqual([]);
    });
});

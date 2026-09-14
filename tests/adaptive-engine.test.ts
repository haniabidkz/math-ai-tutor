import { describe, expect, it } from "vitest";
import {
    addDays,
    chooseQuizDifficulty,
    isMastered,
    isWeeklyAssessmentDue,
    masteryPercentage,
    nextDiagnosticDifficulty,
    scoreDelta,
} from "@/lib/adaptive-engine";

describe("adaptive engine", () => {
    it("starts from the supplied diagnostic difficulty and scales up", () => {
        expect(nextDiagnosticDifficulty("medium", [true, true])).toBe("hard");
        expect(nextDiagnosticDifficulty("hard", [true, true, true])).toBe("hard");
    });

    it("scales down from running low accuracy", () => {
        expect(nextDiagnosticDifficulty("medium", [false])).toBe("easy");
        expect(nextDiagnosticDifficulty("easy", [false, false, true])).toBe("easy");
    });

    it("uses the latest three answers", () => {
        expect(nextDiagnosticDifficulty("medium", [false, false, true, true, true])).toBe("hard");
    });

    it("rewards correct answers and never deducts for mistakes or hints", () => {
        expect(scoreDelta("correct")).toBe(1);
        expect(scoreDelta("incorrect")).toBe(0);
        expect(scoreDelta("hint", false)).toBe(0);
        expect(scoreDelta("hint", true)).toBe(0);
    });

    it("chooses the quiz level without asking the student", () => {
        expect(chooseQuizDifficulty({})).toBe("medium");
        expect(chooseQuizDifficulty({ baseline: "easy" })).toBe("easy");
        expect(chooseQuizDifficulty({ adaptiveLevel: 1 })).toBe("easy");
        expect(chooseQuizDifficulty({ adaptiveLevel: 5 })).toBe("hard");
        // A strong last result steps up; a weak one steps down.
        expect(chooseQuizDifficulty({ baseline: "medium", conceptPercentage: 90 })).toBe("hard");
        expect(chooseQuizDifficulty({ baseline: "medium", conceptPercentage: 30 })).toBe("easy");
        expect(chooseQuizDifficulty({ baseline: "hard", conceptPercentage: 95 })).toBe("hard");
        expect(chooseQuizDifficulty({ baseline: "easy", conceptPercentage: 10 })).toBe("easy");
    });

    it("clamps mastery percentages and enforces threshold", () => {
        expect(masteryPercentage(-1, 10)).toBe(0);
        expect(masteryPercentage(11, 10)).toBe(100);
        expect(isMastered(7, 10)).toBe(true);
        expect(isMastered(6.5, 10)).toBe(false);
    });

    it("detects weekly due dates", () => {
        const now = new Date("2026-07-21T00:00:00Z");
        expect(isWeeklyAssessmentDue(addDays(now, -1), now)).toBe(true);
        expect(isWeeklyAssessmentDue(addDays(now, 1), now)).toBe(false);
        expect(isWeeklyAssessmentDue(undefined, now)).toBe(false);
    });
});

import { describe, expect, it } from "vitest";
import {
    addDays,
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

    it("applies scoring and makes hints idempotent", () => {
        expect(scoreDelta("correct")).toBe(1);
        expect(scoreDelta("incorrect")).toBe(-1);
        expect(scoreDelta("hint", false)).toBe(-0.5);
        expect(scoreDelta("hint", true)).toBe(0);
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

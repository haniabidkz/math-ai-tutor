import { describe, expect, it } from "vitest";
import { buildDiagnosticProfile, type StoredAnswer } from "@/lib/assessment-session";

function answer(microTag: string, isCorrect: boolean, index: number): StoredAnswer {
    return {
        eventId: `event-${index}`,
        questionId: `question-${index}`,
        microTag,
        difficulty: "medium",
        optionId: "A",
        isCorrect,
        scoreDelta: isCorrect ? 1 : -1,
        answeredAt: new Date(0),
    };
}

describe("diagnostic profiles", () => {
    it("classifies concepts at the 70 percent threshold", () => {
        const answers = [
            ...Array.from({ length: 10 }, (_, index) => answer("strong", index < 7, index)),
            ...Array.from({ length: 10 }, (_, index) => answer("weak", index < 6, index + 10)),
        ];
        const profile = buildDiagnosticProfile(answers, 7, "fallback", "hard");
        expect(profile.strongMicroTags).toEqual(["strong"]);
        expect(profile.weakMicroTags).toEqual(["weak"]);
        expect(profile.recommendedMicroTag).toBe("weak");
        expect(profile.accuracyPercent).toBe(65);
    });

    it("uses a deterministic fallback when there are no weak concepts", () => {
        const profile = buildDiagnosticProfile([answer("strong", true, 1)], 6, "fallback", "medium");
        expect(profile.recommendedMicroTag).toBe("fallback");
    });
});

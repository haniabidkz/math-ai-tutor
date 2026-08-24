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
            ...Array.from({ length: 10 }, (_, index) => answer("c7-term-segmentation", index < 7, index)),
            ...Array.from({ length: 10 }, (_, index) => answer("c7-coefficients", index < 6, index + 10)),
        ];
        const profile = buildDiagnosticProfile(answers, 7, "c7-variable-constant-isolation", "hard");
        expect(profile.strongMicroTags).toEqual(["c7-term-segmentation"]);
        expect(profile.weakMicroTags).toEqual(["c7-coefficients"]);
        expect(profile.weakTopic?.english).toBe("Algebraic Expressions");
        expect(profile.recommendedMicroTag).toBe("c7-variable-constant-isolation");
        expect(profile.accuracyPercent).toBe(65);
        expect(profile.mathLevel).toBe(7);
    });

    it("uses a deterministic fallback when there are no weak concepts", () => {
        const profile = buildDiagnosticProfile([answer("c6-integers-intro", true, 1)], 6, "c6-integers-intro", "medium");
        expect(profile.recommendedMicroTag).toBe("c6-integers-intro");
        expect(profile.weakMicroTag).toBeNull();
        expect(profile.mathLevel).toBe(6);
    });

    it("reports the previous class when current-class accuracy is below 60 percent", () => {
        const answers = [
            answer("c6-integers-intro", true, 1),
            answer("c7-variable-constant-isolation", false, 2),
            answer("c7-term-segmentation", false, 3),
        ];
        const profile = buildDiagnosticProfile(answers, 7, "c7-variable-constant-isolation", "medium");
        expect(profile.mathLevel).toBe(6);
        expect(profile.assessedClassLevel).toBe(7);
    });
});

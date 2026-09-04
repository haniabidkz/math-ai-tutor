import { describe, expect, it } from "vitest";
import { buildDiagnosticProfile, sessionXp, type StoredAnswer } from "@/lib/assessment-session";
import { getDiagnosticConceptOrder } from "@/lib/diagnostic-blueprint";
import { XP_FIRST_ATTEMPT_CORRECT, XP_QUIZ_COMPLETED } from "@/lib/gamification";

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

/** The diagnostic asks one question per concept, in blueprint order. */
function diagnosticAnswers(classLevel: 6 | 7 | 8, isCorrect: (index: number) => boolean): StoredAnswer[] {
    return getDiagnosticConceptOrder(classLevel).map((concept, index) => answer(concept.microTag, isCorrect(index), index));
}

describe("diagnostic profiles", () => {
    it("splits concepts into strong and weak from the single question each was asked", () => {
        const order = getDiagnosticConceptOrder(7);
        const profile = buildDiagnosticProfile(diagnosticAnswers(7, (index) => index % 2 === 0), 7, order[0].microTag, "medium");

        expect(profile.strongMicroTags).toContain(order[0].microTag);
        expect(profile.weakMicroTags).toContain(order[1].microTag);
        expect(profile.strongMicroTags).toHaveLength(8);
        expect(profile.weakMicroTags).toHaveLength(7);
        expect(profile.overallCorrect).toBe(8);
        expect(profile.accuracyPercent).toBe(53);
    });

    it("uses a deterministic fallback when nothing was answered wrongly", () => {
        const profile = buildDiagnosticProfile(diagnosticAnswers(6, () => true), 6, "c6-integers-intro", "medium");
        expect(profile.recommendedMicroTag).toBe("c6-integers-intro");
        expect(profile.weakMicroTag).toBeNull();
        expect(profile.mathLevel).toBe(6);
        expect(profile.overallBand).toBe("strong");
    });

    it("reports the previous class when current-class accuracy is below 60 percent", () => {
        const order = getDiagnosticConceptOrder(7);
        const currentClassTags = new Set(order.filter((c) => c.classLevel === 7).map((c) => c.microTag));
        const answers = order.map((concept, index) => answer(concept.microTag, !currentClassTags.has(concept.microTag), index));

        const profile = buildDiagnosticProfile(answers, 7, "c7-variable-constant-isolation", "medium");
        expect(profile.mathLevel).toBe(6);
        expect(profile.assessedClassLevel).toBe(7);
    });

    it("always recommends a concept from the enrolled class", () => {
        for (const classLevel of [6, 7, 8] as const) {
            const profile = buildDiagnosticProfile(diagnosticAnswers(classLevel, () => false), classLevel, getDiagnosticConceptOrder(classLevel)[0].microTag, "easy");
            expect(profile.overallBand).toBe("weak");
            expect(profile.recommendedMicroTag).toBeTruthy();
        }
    });
});

describe("session experience points", () => {
    it("counts the completion bonus plus every unaided correct answer", () => {
        const answers: StoredAnswer[] = [
            { ...answer("a", true, 1) },
            { ...answer("b", true, 2), hintUsed: true },
            { ...answer("c", false, 3) },
            { ...answer("d", true, 4), practice: true },
            { ...answer("e", true, 5) },
        ];
        expect(sessionXp({ answers })).toBe(XP_QUIZ_COMPLETED + 2 * XP_FIRST_ATTEMPT_CORRECT);
    });

    it("still awards the completion bonus when nothing was answered correctly", () => {
        expect(sessionXp({ answers: [answer("a", false, 1)] })).toBe(XP_QUIZ_COMPLETED);
    });
});

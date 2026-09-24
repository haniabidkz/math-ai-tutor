import { describe, expect, it } from "vitest";
import { buildDiagnosticProfile, sessionXp, type StoredAnswer } from "@/lib/assessment-session";
import { getDiagnosticQuestionOrder } from "@/lib/diagnostic-questions";
import { XP_FIRST_ATTEMPT_CORRECT, XP_QUIZ_COMPLETED } from "@/lib/gamification";

function answer(microTag: string, isCorrect: boolean, index: number, questionId = `question-${index}`): StoredAnswer {
    return {
        eventId: `event-${index}`,
        questionId,
        microTag,
        difficulty: "medium",
        optionId: "A",
        isCorrect,
        scoreDelta: isCorrect ? 1 : 0,
        answeredAt: new Date(0),
    };
}

/** The diagnostic asks its fifteen fixed questions in order. */
function diagnosticAnswers(classLevel: 6 | 7 | 8, isCorrect: (index: number) => boolean): StoredAnswer[] {
    return getDiagnosticQuestionOrder(classLevel).map((question, index) => answer(question.microTag, isCorrect(index), index, question.id));
}

describe("diagnostic profiles", () => {
    it("reports the overall score and accuracy", () => {
        const profile = buildDiagnosticProfile(diagnosticAnswers(7, (index) => index % 2 === 0), 7, "c7-variable-constant-isolation", "medium");
        expect(profile.overallCorrect).toBe(8);
        expect(profile.overallTotal).toBe(15);
        expect(profile.accuracyPercent).toBe(53);
        expect(profile.assessedClassLevel).toBe(7);
        expect(profile.mathLevel).toBe(6);
    });

    it("uses a deterministic fallback when nothing was answered wrongly", () => {
        const profile = buildDiagnosticProfile(diagnosticAnswers(6, () => true), 6, "c6-integers-intro", "medium");
        expect(profile.recommendedMicroTag).toBe("c6-integers-intro");
        expect(profile.weakMicroTag).toBeNull();
        expect(profile.mathLevel).toBe(6);
        expect(profile.overallBand).toBe("strong");
    });

    it("always recommends a concept from the enrolled class", () => {
        for (const classLevel of [6, 7, 8] as const) {
            const profile = buildDiagnosticProfile(diagnosticAnswers(classLevel, () => false), classLevel, "c6-integers-intro", "easy");
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

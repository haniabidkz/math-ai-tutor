import { describe, expect, it } from "vitest";
import {
    DIAGNOSTIC_QUESTION_COUNT,
    DIAGNOSTIC_QUESTIONS_PER_TOPIC,
    DIAGNOSTIC_TOPIC_COUNT,
    getDiagnosticBlueprint,
    getDiagnosticConceptOrder,
    getDiagnosticTopicFor,
    overallBand,
    topicBand,
} from "@/lib/diagnostic-blueprint";
import { buildDiagnosticProfile, type StoredAnswer } from "@/lib/assessment-session";
import { getConcept } from "@/lib/curriculum";

const classes = [6, 7, 8] as const;

function answersFor(classLevel: 6 | 7 | 8, correctPredicate: (index: number) => boolean): StoredAnswer[] {
    return getDiagnosticConceptOrder(classLevel).map((concept, index) => ({
        eventId: `e-${index}`,
        questionId: `q-${index}`,
        microTag: concept.microTag,
        difficulty: "medium" as const,
        optionId: "A",
        isCorrect: correctPredicate(index),
        scoreDelta: correctPredicate(index) ? 1 : -1,
        answeredAt: new Date(0),
    }));
}

describe("diagnostic blueprint", () => {
    it("is five topics of three questions", () => {
        expect(DIAGNOSTIC_QUESTION_COUNT).toBe(15);
        for (const classLevel of classes) {
            const blueprint = getDiagnosticBlueprint(classLevel);
            expect(blueprint).toHaveLength(DIAGNOSTIC_TOPIC_COUNT);
            for (const topic of blueprint) {
                expect(topic.microTags).toHaveLength(DIAGNOSTIC_QUESTIONS_PER_TOPIC);
            }
        }
    });

    it("references only concepts that exist, with no repeats inside a class", () => {
        for (const classLevel of classes) {
            const order = getDiagnosticConceptOrder(classLevel);
            expect(order).toHaveLength(15);
            for (const concept of order) expect(getConcept(concept.microTag)).toBeTruthy();
            expect(new Set(order.map((c) => c.microTag)).size).toBe(15);
        }
    });

    it("mixes the previous class with the enrolled class", () => {
        for (const classLevel of classes) {
            const order = getDiagnosticConceptOrder(classLevel);
            expect(order.some((c) => c.classLevel < classLevel)).toBe(true);
            expect(order.some((c) => c.classLevel === classLevel)).toBe(true);
        }
    });

    it("maps question positions onto their topic", () => {
        const blueprint = getDiagnosticBlueprint(7);
        expect(getDiagnosticTopicFor(7, 0).topicKey).toBe(blueprint[0].topicKey);
        expect(getDiagnosticTopicFor(7, 2).topicKey).toBe(blueprint[0].topicKey);
        expect(getDiagnosticTopicFor(7, 3).topicKey).toBe(blueprint[1].topicKey);
        expect(getDiagnosticTopicFor(7, 14).topicKey).toBe(blueprint[4].topicKey);
    });
});

describe("scoring bands", () => {
    it("bands a topic out of three", () => {
        expect(topicBand(3)).toBe("strong");
        expect(topicBand(2)).toBe("needs-practice");
        expect(topicBand(1)).toBe("weak");
        expect(topicBand(0)).toBe("very-weak");
    });

    it("bands the overall score out of fifteen", () => {
        expect(overallBand(15)).toBe("strong");
        expect(overallBand(12)).toBe("strong");
        expect(overallBand(11)).toBe("needs-practice");
        expect(overallBand(8)).toBe("needs-practice");
        expect(overallBand(7)).toBe("weak");
        expect(overallBand(0)).toBe("weak");
    });
});

describe("diagnostic profile", () => {
    it("scores all five topics and the overall band", () => {
        const profile = buildDiagnosticProfile(answersFor(8, () => true), 8, "c8-equation-revision", "hard");
        expect(profile.topicResults).toHaveLength(5);
        expect(profile.topicResults.every((topic) => topic.band === "strong")).toBe(true);
        expect(profile.overallCorrect).toBe(15);
        expect(profile.overallBand).toBe("strong");
        expect(profile.accuracyPercent).toBe(100);
    });

    it("bands each topic independently", () => {
        // First topic all wrong, everything else correct.
        const profile = buildDiagnosticProfile(answersFor(7, (index) => index >= 3), 7, "c7-variable-constant-isolation", "medium");
        expect(profile.topicResults[0].band).toBe("very-weak");
        expect(profile.topicResults.slice(1).every((topic) => topic.band === "strong")).toBe(true);
        expect(profile.overallCorrect).toBe(12);
        expect(profile.overallBand).toBe("strong");
    });

    it("recommends work related to the weakest topic", () => {
        const profile = buildDiagnosticProfile(answersFor(8, (index) => index >= 3), 8, "c8-equation-revision", "medium");
        expect(profile.topicResults[0].band).toBe("very-weak");
        expect(profile.weakMicroTag).toBe(getDiagnosticConceptOrder(8)[0].microTag);
        expect(profile.recommendedMicroTag).toBeTruthy();
        expect(getConcept(profile.recommendedMicroTag)?.classLevel).toBe(8);
    });

    it("reports a weak overall band when most answers are wrong", () => {
        const profile = buildDiagnosticProfile(answersFor(6, (index) => index < 5), 6, "c6-integers-intro", "easy");
        expect(profile.overallCorrect).toBe(5);
        expect(profile.overallBand).toBe("weak");
        expect(profile.mathLevel).toBe(5);
    });
});

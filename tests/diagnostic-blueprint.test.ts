import { describe, expect, it } from "vitest";
import {
    DIAGNOSTIC_QUESTION_COUNT,
    DIAGNOSTIC_QUESTIONS_PER_TOPIC,
    DIAGNOSTIC_TOPIC_COUNT,
    diagnosticQuestionId,
    getDiagnosticBlueprint,
    getDiagnosticQuestionIds,
    getDiagnosticTopicFor,
    overallBand,
    topicBand,
} from "@/lib/diagnostic-blueprint";
import { DIAGNOSTIC_QUESTIONS, getDiagnosticQuestionOrder } from "@/lib/diagnostic-questions";
import { buildDiagnosticProfile, type StoredAnswer } from "@/lib/assessment-session";
import { validateDiagnosticTests } from "@/lib/content-validation";
import { getConcept } from "@/lib/curriculum";

const classes = [6, 7, 8] as const;

function answersFor(classLevel: 6 | 7 | 8, correctPredicate: (index: number) => boolean): StoredAnswer[] {
    return getDiagnosticQuestionOrder(classLevel).map((question, index) => ({
        eventId: `e-${index}`,
        questionId: question.id,
        microTag: question.microTag,
        difficulty: question.difficulty,
        optionId: "A",
        isCorrect: correctPredicate(index),
        scoreDelta: correctPredicate(index) ? 1 : 0,
        answeredAt: new Date(0),
    }));
}

/** The answer key exactly as supplied by the owner, Q1 to Q15. */
const ANSWER_KEYS = {
    6: "CBCBBCBCCCCDBCC",
    7: "CBCCBCBCBBBCCCC",
    8: "CCABBBBCBCCBBBC",
} as const;

describe("diagnostic tests", () => {
    it("are five topics of one easy, one medium and one hard question", () => {
        expect(DIAGNOSTIC_QUESTION_COUNT).toBe(15);
        for (const classLevel of classes) {
            const blueprint = getDiagnosticBlueprint(classLevel);
            expect(blueprint).toHaveLength(DIAGNOSTIC_TOPIC_COUNT);
            for (const topic of blueprint) expect(topic.questionIds).toHaveLength(DIAGNOSTIC_QUESTIONS_PER_TOPIC);
            expect(getDiagnosticQuestionOrder(classLevel).map((question) => question.difficulty))
                .toEqual(Array.from({ length: 5 }, () => ["easy", "medium", "hard"]).flat());
        }
    });

    it("pass every structural check", () => {
        expect(validateDiagnosticTests()).toEqual([]);
    });

    it("keep the owner's answer key", () => {
        for (const classLevel of classes) {
            expect(DIAGNOSTIC_QUESTIONS[classLevel].map((question) => question.correctOptionId).join("")).toBe(ANSWER_KEYS[classLevel]);
        }
    });

    it("keep the owner's wording and options", () => {
        const [c6, c7, c8] = classes.map((classLevel) => DIAGNOSTIC_QUESTIONS[classLevel]);
        expect(c6[0].question.english).toBe("What is the value of the digit 7 in 47,325?");
        expect(c6[0].options.map((option) => option.english)).toEqual(["7", "70", "7,000", "70,000"]);
        expect(c6[14].options.find((option) => option.id === c6[14].correctOptionId)?.english).toBe("24 cm²");
        expect(c7[5].question.english).toBe("Sara has 2 1/2 meters of ribbon. She uses 3/4 meter. How much ribbon is left?");
        expect(c7[5].options.find((option) => option.id === c7[5].correctOptionId)?.english).toBe("1 3/4 m");
        expect(c8[1].question.english).toBe("Calculate: -12 + 7 - (-5).");
        expect(c8[5].options.find((option) => option.id === c8[5].correctOptionId)?.english).toBe("1/2");
        expect(c8[12].question.english).toBe("Simplify: 5x + 2x");
        expect(c8[8].options.map((option) => option.english)).toEqual(["Rs. 1,000", "Rs. 1,100", "Rs. 1,200", "Rs. 1,300"]);
    });

    it("test the previous class, with fixed ids and questions kept out of quizzes", () => {
        for (const classLevel of classes) {
            const questions = getDiagnosticQuestionOrder(classLevel);
            expect(questions.map((question) => question.id)).toEqual(getDiagnosticQuestionIds(classLevel));
            expect(questions[0].id).toBe(diagnosticQuestionId(classLevel, 0));
            for (const question of questions) {
                expect(getConcept(question.microTag)?.classLevel).toBe(classLevel - 1);
                expect(getConcept(question.microTag)?.foundationOnly).toBe(true);
                expect(question.classLevel).toBe(classLevel - 1);
                expect(question).toMatchObject({ purpose: "diagnostic", diagnosticFor: classLevel, status: "published" });
                expect(Object.keys(question.optionAnalysis ?? {})).toHaveLength(3);
            }
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
        expect(profile.topicResults.every((topic) => topic.band === "strong" && topic.correct === 3 && topic.total === 3)).toBe(true);
        expect(profile.overallCorrect).toBe(15);
        expect(profile.overallBand).toBe("strong");
        expect(profile.accuracyPercent).toBe(100);
        expect(profile.weakMicroTag).toBeNull();
        expect(profile.weakTopic).toBeNull();
    });

    it("counts all three questions of a topic, not just the last one", () => {
        // Topic 1: easy and medium right, hard wrong.
        const profile = buildDiagnosticProfile(answersFor(6, (index) => index !== 2), 6, "c6-integers-intro", "medium");
        expect(profile.topicResults[0]).toMatchObject({ correct: 2, total: 3, band: "needs-practice" });
        expect(profile.overallCorrect).toBe(14);
    });

    it("bands each topic independently", () => {
        const profile = buildDiagnosticProfile(answersFor(7, (index) => index >= 3), 7, "c7-variable-constant-isolation", "medium");
        expect(profile.topicResults[0].band).toBe("very-weak");
        expect(profile.topicResults.slice(1).every((topic) => topic.band === "strong")).toBe(true);
        expect(profile.overallCorrect).toBe(12);
        expect(profile.overallBand).toBe("strong");
    });

    it("recommends the lesson the weakest topic leads into", () => {
        // Class 8, topic 4 (ratio) all wrong.
        const profile = buildDiagnosticProfile(answersFor(8, (index) => index < 9 || index > 11), 8, "c8-equation-revision", "medium");
        expect(profile.topicResults[3].band).toBe("very-weak");
        expect(profile.weakMicroTag).toBe("c7-ratio-financial");
        expect(profile.weakTopic?.english).toBe("Ratio, Proportion & Financial Arithmetic");
        expect(profile.recommendedMicroTag).toBe("c8-ratio-basics");
        expect(profile.topicResults[3].lessonTags).toEqual(["c8-ratio-basics"]);
    });

    it("follows the prerequisite chain when a topic names no lesson", () => {
        // Class 6, whole numbers wrong: c6-integers-intro builds on it through c5-number-line.
        const profile = buildDiagnosticProfile(answersFor(6, (index) => index >= 3), 6, "c6-variable-foundations", "easy");
        expect(profile.recommendedMicroTag).toBe("c6-integers-intro");
    });

    it("falls back to the given lesson when the weak topic leads nowhere in this class", () => {
        // Class 7, geometry wrong: no Class 7 lesson builds on it.
        const profile = buildDiagnosticProfile(answersFor(7, (index) => index < 12), 7, "c7-variable-constant-isolation", "medium");
        expect(profile.weakMicroTag).toBe("c6-basic-geometry");
        expect(profile.recommendedMicroTag).toBe("c7-variable-constant-isolation");
        expect(getConcept(profile.recommendedMicroTag)?.classLevel).toBe(7);
    });

    it("splits foundations into strong and weak by the majority of their three questions", () => {
        // Topic 1: 3/3, topic 2: 2/3, topic 3: 1/3, topic 4: 0/3, topic 5: 3/3.
        const right = new Set([0, 1, 2, 3, 4, 6, 12, 13, 14]);
        const profile = buildDiagnosticProfile(answersFor(6, (index) => right.has(index)), 6, "c6-integers-intro", "medium");
        expect(profile.strongMicroTags).toEqual(["c5-whole-number-operations", "c5-fractions", "c5-basic-geometry"]);
        expect(profile.weakMicroTags).toEqual(["c5-decimals", "c5-factors-multiples"]);
    });

    it("places the student in the previous class below 60 percent", () => {
        expect(buildDiagnosticProfile(answersFor(6, (index) => index < 9), 6, "c6-integers-intro", "medium").mathLevel).toBe(6);
        const weak = buildDiagnosticProfile(answersFor(6, (index) => index < 5), 6, "c6-integers-intro", "easy");
        expect(weak.overallCorrect).toBe(5);
        expect(weak.overallBand).toBe("weak");
        expect(weak.mathLevel).toBe(5);
    });

    it("always recommends a lesson of the enrolled class", () => {
        for (const classLevel of classes) {
            const profile = buildDiagnosticProfile(answersFor(classLevel, () => false), classLevel, "missing-tag", "easy");
            expect(getConcept(profile.recommendedMicroTag)?.classLevel).toBe(classLevel);
            expect(getConcept(profile.recommendedMicroTag)?.foundationOnly).toBeFalsy();
        }
    });
});

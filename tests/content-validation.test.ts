import { describe, expect, it } from "vitest";
import { MICRO_CONCEPTS, isLearningConceptForClass } from "@/lib/curriculum";
import { QUESTION_BANK } from "@/lib/question-bank";
import { validateContentBank } from "@/lib/content-validation";

describe("MVP content bank", () => {
    it("contains the expected MVP coverage", () => {
        expect(MICRO_CONCEPTS).toHaveLength(48);
        expect(QUESTION_BANK).toHaveLength(960);
    });

    it("contains twenty localized questions per concept", () => {
        for (const concept of MICRO_CONCEPTS) {
            const questions = QUESTION_BANK.filter((question) => question.microTag === concept.microTag);
            expect(questions).toHaveLength(20);
            expect(questions.every((question) => question.classLevel === concept.classLevel)).toBe(true);
            expect(questions.every((question) => question.question.english && question.question.romanUrdu)).toBe(true);
            expect(new Set(questions.map((question) => question.difficulty))).toEqual(new Set(["easy", "medium", "hard"]));
        }
    });

    it("only exposes learning concepts to their own class", () => {
        const classSixConcept = MICRO_CONCEPTS.find((concept) => concept.microTag === "c6-integers-intro")!;
        const foundationConcept = MICRO_CONCEPTS.find((concept) => concept.microTag === "c5-whole-number-operations")!;

        expect(isLearningConceptForClass(classSixConcept, 6)).toBe(true);
        expect(isLearningConceptForClass(classSixConcept, 7)).toBe(false);
        expect(isLearningConceptForClass(foundationConcept, 6)).toBe(false);
    });

    it("rejects a question whose class does not match its concept", () => {
        const questionBank = [...QUESTION_BANK];
        questionBank[0] = { ...questionBank[0], classLevel: 6 };
        const result = validateContentBank(MICRO_CONCEPTS, questionBank);

        expect(result.valid).toBe(false);
        expect(result.errors.some((error) => error.includes("does not match"))).toBe(true);
    });

    it("passes schema, answer, duplicate, and prerequisite validation", () => {
        const result = validateContentBank();
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });
});

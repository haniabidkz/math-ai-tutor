import { describe, expect, it } from "vitest";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { QUESTION_BANK } from "@/lib/question-bank";
import { validateContentBank } from "@/lib/content-validation";

describe("MVP content bank", () => {
    it("contains the expected MVP coverage", () => {
        expect(MICRO_CONCEPTS).toHaveLength(48);
        expect(QUESTION_BANK).toHaveLength(480);
    });

    it("contains ten localized questions per concept", () => {
        for (const concept of MICRO_CONCEPTS) {
            const questions = QUESTION_BANK.filter((question) => question.microTag === concept.microTag);
            expect(questions).toHaveLength(10);
            expect(questions.every((question) => question.question.english && question.question.romanUrdu)).toBe(true);
        }
    });

    it("passes schema, answer, duplicate, and prerequisite validation", () => {
        const result = validateContentBank();
        expect(result.errors).toEqual([]);
        expect(result.valid).toBe(true);
    });
});

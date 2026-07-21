import { describe, expect, it } from "vitest";
import { conceptInputSchema, questionInputSchema } from "@/lib/admin-schemas";
import { QUESTION_BANK } from "@/lib/question-bank";

describe("Super Admin payload validation", () => {
    it("accepts a seeded bilingual question", () => {
        expect(questionInputSchema.safeParse(QUESTION_BANK[0]).success).toBe(true);
    });

    it("rejects duplicate answer options", () => {
        const question = structuredClone(QUESTION_BANK[0]);
        question.options[1].english = question.options[0].english;
        expect(questionInputSchema.safeParse(question).success).toBe(false);
    });

    it("rejects invalid curriculum class levels", () => {
        expect(conceptInputSchema.safeParse({ classLevel: 10 }).success).toBe(false);
    });
});

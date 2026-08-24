import { describe, expect, it } from "vitest";
import { getQuestionsForConcept } from "@/lib/question-bank";
import { selectQuizQuestionSet } from "@/lib/question-selection";

describe("quiz question rotation", () => {
    it("gives Quiz 2 a completely different set from Quiz 1", () => {
        const bank = getQuestionsForConcept("c6-integers-intro");
        const first = selectQuizQuestionSet(bank, 10, "medium");
        const second = selectQuizQuestionSet(bank, 10, "medium", first.map((question) => question.id));
        const firstIds = new Set(first.map((question) => question.id));

        expect(first).toHaveLength(10);
        expect(second).toHaveLength(10);
        expect(second.every((question) => !firstIds.has(question.id))).toBe(true);
    });
});

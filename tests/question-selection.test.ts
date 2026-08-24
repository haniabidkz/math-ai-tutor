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

    it("uses the full unseen history before starting a new cycle", () => {
        const bank = getQuestionsForConcept("c6-integers-intro");
        const first = selectQuizQuestionSet(bank, 10, "medium");
        const second = selectQuizQuestionSet(bank, 10, "medium", first.map((question) => question.id), first.map((question) => question.id));
        const seen = [...first, ...second].map((question) => question.id);
        const third = selectQuizQuestionSet(bank, 10, "medium", seen, second.map((question) => question.id));
        const secondIds = new Set(second.map((question) => question.id));

        expect(new Set(seen)).toHaveLength(bank.length);
        expect(third).toHaveLength(10);
        expect(third.every((question) => !secondIds.has(question.id))).toBe(true);
    });

    it("does not discard the remaining unseen questions when a cycle is nearly exhausted", () => {
        const bank = getQuestionsForConcept("c6-integers-intro");
        const seen = bank.slice(0, 15).map((question) => question.id);
        const previousAttempt = bank.slice(5, 15).map((question) => question.id);
        const selected = selectQuizQuestionSet(bank, 10, "hard", seen, previousAttempt);
        const selectedIds = new Set(selected.map((question) => question.id));

        expect(bank.slice(15).every((question) => selectedIds.has(question.id))).toBe(true);
        expect(selected.every((question) => !previousAttempt.includes(question.id))).toBe(true);
    });
});

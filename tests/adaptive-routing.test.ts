import { describe, expect, it } from "vitest";
import { getQuestionsForConcept } from "@/lib/question-bank";
import { nextDifficulty, orderByFreshness, takeNextQuestion, targetDifficulty } from "@/lib/question-selection";
import type { QuestionBankItem } from "@/types/curriculum";

const bank = getQuestionsForConcept("c6-integers-intro");

describe("adaptive question sequencing", () => {
    it("steps up after a correct answer and down after a wrong one, within the three levels", () => {
        expect(nextDifficulty("easy", true)).toBe("medium");
        expect(nextDifficulty("medium", true)).toBe("hard");
        expect(nextDifficulty("hard", true)).toBe("hard");
        expect(nextDifficulty("hard", false)).toBe("medium");
        expect(nextDifficulty("medium", false)).toBe("easy");
        expect(nextDifficulty("easy", false)).toBe("easy");
    });

    it("always opens with two easy questions, then follows the last answer", () => {
        expect(targetDifficulty(0, null)).toBe("easy");
        expect(targetDifficulty(1, { difficulty: "easy", correct: true })).toBe("easy");
        expect(targetDifficulty(2, { difficulty: "easy", correct: true })).toBe("medium");
        expect(targetDifficulty(2, { difficulty: "easy", correct: false })).toBe("easy");
        expect(targetDifficulty(5, { difficulty: "hard", correct: false })).toBe("medium");
    });

    it("takes the wanted level from the pool, or the nearest level that has one", () => {
        const first = takeNextQuestion(bank, "hard")!;
        expect(first.question.difficulty).toBe("hard");
        expect(first.pool).toHaveLength(bank.length - 1);
        expect(first.pool.some((question) => question.id === first.question.id)).toBe(false);

        const mediumOnly = bank.filter((question) => question.difficulty === "medium");
        expect(takeNextQuestion(mediumOnly, "easy")!.question.difficulty).toBe("medium");
        expect(takeNextQuestion(mediumOnly, "hard")!.question.difficulty).toBe("medium");
        const easyAndHard = bank.filter((question) => question.difficulty !== "medium");
        expect(takeNextQuestion(easyAndHard, "medium")!.question.difficulty).toBe("easy");
        expect(takeNextQuestion([], "easy")).toBeNull();
    });

    it("serves unseen questions before repeats, and the last attempt's questions last", () => {
        const seen = bank.slice(0, 15).map((question) => question.id);
        const lastAttempt = bank.slice(10, 15).map((question) => question.id);
        const ordered = orderByFreshness(bank, seen, lastAttempt);
        expect(ordered.slice(0, 5).map((question) => question.id)).toEqual(bank.slice(15).map((question) => question.id));
        expect(ordered.slice(-5).map((question) => question.id)).toEqual(lastAttempt);
        expect(ordered).toHaveLength(bank.length);
    });

    it("plays a whole quiz up and down the ladder", () => {
        let pool: QuestionBankItem[] = orderByFreshness(bank);
        const answers = [true, true, true, true, false, false, true];
        const served: QuestionBankItem[] = [];
        let last: { difficulty: QuestionBankItem["difficulty"]; correct: boolean } | null = null;
        for (const correct of answers) {
            const pick: { question: QuestionBankItem; pool: QuestionBankItem[] } = takeNextQuestion(pool, targetDifficulty(served.length, last))!;
            served.push(pick.question);
            pool = pick.pool;
            last = { difficulty: pick.question.difficulty, correct };
        }
        expect(served.map((question) => question.difficulty)).toEqual(["easy", "easy", "medium", "hard", "hard", "medium", "easy"]);
        expect(new Set(served.map((question) => question.id)).size).toBe(7);
    });
});

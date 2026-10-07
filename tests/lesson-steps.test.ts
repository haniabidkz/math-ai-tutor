import { describe, expect, it } from "vitest";
import { commonMistake, keyIdea, pickPractice, toPracticeItem, withoutHeading, LESSON_STEPS } from "@/lib/lesson-steps";
import type { QuestionBankItem } from "@/types/curriculum";

const text = (english: string, romanUrdu = english) => ({ english, romanUrdu });

function question(id: string, difficulty: QuestionBankItem["difficulty"], withAnalysis = true): QuestionBankItem {
    return {
        id,
        microTag: "c6-defination-of-sets",
        prerequisiteTag: null,
        classLevel: 6,
        difficulty,
        question: text("Which  writing shows a set?"),
        options: [
            { id: "A", english: "{1, 2}", romanUrdu: "{1, 2}" },
            { id: "B", english: "(1, 2)", romanUrdu: "(1, 2)" },
            { id: "C", english: "[1, 2]", romanUrdu: "[1, 2]" },
            { id: "D", english: "1, 2", romanUrdu: "1, 2" },
        ],
        correctOptionId: "A",
        hint: text("Look at the brackets."),
        explanation: text("Sets use curly brackets."),
        ...(withAnalysis ? {
            optionAnalysis: {
                B: { mistakeType: "concept", misconceptionTag: "arithmetic-slip", whyWrong: text("Round brackets are for ordered pairs.", "Round brackets pair ke liye hain.") },
            },
        } : {}),
        source: "oxford",
        status: "published",
        version: 1,
    };
}

describe("lesson steps", () => {
    it("names five screens in order", () => {
        expect(LESSON_STEPS.map((step) => step.key)).toEqual(["idea", "see", "do", "mistake", "check"]);
    });

    it("takes the first sentence as the big idea and keeps it short", () => {
        expect(keyIdea(text("A set is a well-defined collection. Its things are elements.", "Set saaf collection hai. Cheezein elements hain."))).toEqual({
            english: "A set is a well-defined collection.",
            romanUrdu: "Set saaf collection hai.",
        });
        const long = "word ".repeat(60).trim();
        expect(keyIdea(text(long)).english.length).toBeLessThanOrEqual(182);
        expect(keyIdea(text(long)).english.endsWith("…")).toBe(true);
        // Decimals do not end a sentence.
        expect(keyIdea(text("Half is 0.5 of the whole. Next idea.")).english).toBe("Half is 0.5 of the whole.");
        // Roman Urdu falls back to English when it is missing.
        expect(keyIdea(text("Only English.", "")).romanUrdu).toBe("Only English.");
    });

    it("drops the heading the screen already shows", () => {
        expect(withoutHeading("## Sets\n\nA set is a collection.\n\n**Example:** fruit")).toBe("A set is a collection.\n\n**Example:** fruit");
        expect(withoutHeading("No heading here")).toBe("No heading here");
    });

    it("shapes a bank question with the answer and the reason for each wrong option", () => {
        const item = toPracticeItem(question("q1", "easy"));
        expect(item.correctOptionId).toBe("A");
        expect(item.question.english).toBe("Which writing shows a set?");
        expect(item.whyWrong.B?.english).toBe("Round brackets are for ordered pairs.");
        // Options without an authored reason get the derived one, so every wrong pick explains itself.
        expect(item.whyWrong.C?.english).toContain("The correct answer is {1, 2}");
        expect(item.whyWrong.A).toBeUndefined();
    });

    it("prefers easy questions, in a fresh order, and copes with few questions", () => {
        const bank = [question("h1", "hard"), question("e1", "easy"), question("m1", "medium"), question("e2", "easy"), question("e3", "easy")];
        const first = pickPractice(bank, 2, () => 0.99);
        expect(first.map((item) => item.difficulty)).toEqual(["easy", "easy"]);
        const other = pickPractice(bank, 2, () => 0);
        expect(new Set([...first, ...other].map((item) => item.id)).size).toBeGreaterThan(2);
        expect(pickPractice([question("m1", "medium")], 2).map((item) => item.id)).toEqual(["m1"]);
        expect(pickPractice([], 2)).toEqual([]);
    });

    it("pairs the right answer with a wrong option that has a reason", () => {
        const mistake = commonMistake(toPracticeItem(question("q1", "easy")));
        expect(mistake?.right.id).toBe("A");
        expect(mistake?.wrong.id).toBe("B");
        expect(mistake?.reason.romanUrdu).toBe("Round brackets pair ke liye hain.");
        expect(commonMistake(undefined)).toBeNull();
    });
});

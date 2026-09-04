import { describe, expect, it } from "vitest";
import {
    buildOptionAnalysis,
    deriveMistakeType,
    getOptionAnalysis,
    isPossibleMisconception,
    mistakeProfileId,
} from "@/lib/mistake-analysis";
import { getQuestionsForConcept } from "@/lib/question-bank";
import { QUESTION_BANK } from "@/lib/question-bank";
import type { QuestionBankItem } from "@/types/curriculum";

function question(overrides: Partial<QuestionBankItem> = {}): QuestionBankItem {
    return {
        id: "q-1",
        microTag: "c6-integer-addition",
        prerequisiteTag: "c6-number-line",
        classLevel: 6,
        difficulty: "easy",
        question: { english: "Find -4 + (2).", romanUrdu: "-4 + (2) hal karein." },
        options: [
            { id: "A", english: "-2", romanUrdu: "-2" },
            { id: "B", english: "2", romanUrdu: "2" },
            { id: "C", english: "-3", romanUrdu: "-3" },
            { id: "D", english: "6", romanUrdu: "6" },
        ],
        correctOptionId: "A",
        hint: { english: "Use a number line.", romanUrdu: "Number line istemal karein." },
        explanation: { english: "The answer is -2.", romanUrdu: "Jawab -2 hai." },
        source: "sindh",
        status: "published",
        version: 1,
        ...overrides,
    };
}

describe("mistake classification", () => {
    it("detects a sign error when the chosen value is the negation of the answer", () => {
        expect(deriveMistakeType(question(), "B")).toBe("sign-error");
    });

    it("detects an off-by-one slip", () => {
        expect(deriveMistakeType(question(), "C")).toBe("off-by-one");
    });

    it("falls back to the concept family for non-numeric relationships", () => {
        expect(deriveMistakeType(question({ microTag: "c7-coefficients" }), "D")).toBe("coefficient-misread");
        expect(deriveMistakeType(question({ microTag: "c8-solving-proportions" }), "D")).toBe("ratio-order");
        expect(deriveMistakeType(question({ microTag: "c8-multi-step-equations" }), "D")).toBe("partial-step");
    });

    it("never analyses the correct option", () => {
        expect(getOptionAnalysis(question(), "A")).toBeNull();
    });

    it("prefers authored analysis over the derived fallback", () => {
        const authored = question({
            optionAnalysis: {
                B: { mistakeType: "operation-confusion", explanation: { english: "You added instead.", romanUrdu: "Aap ne jama kiya." } },
            },
        });
        const analysis = getOptionAnalysis(authored, "B");
        expect(analysis?.mistakeType).toBe("operation-confusion");
        expect(analysis?.explanation.english).toBe("You added instead.");
    });

    it("builds bilingual analysis for every distractor", () => {
        const analysis = buildOptionAnalysis(question());
        expect(Object.keys(analysis).sort()).toEqual(["B", "C", "D"]);
        for (const entry of Object.values(analysis)) {
            expect(entry.explanation.english.length).toBeGreaterThan(0);
            expect(entry.explanation.romanUrdu.length).toBeGreaterThan(0);
        }
    });
});

describe("misconception detection", () => {
    it("treats a repeated mistake type as a possible misconception", () => {
        expect(isPossibleMisconception(1, 3)).toBe(false);
        expect(isPossibleMisconception(2, 3)).toBe(false);
        expect(isPossibleMisconception(3, 3)).toBe(true);
        expect(isPossibleMisconception(4, 3)).toBe(true);
    });

    it("never triggers on a single mistake even with a low threshold", () => {
        expect(isPossibleMisconception(1, 1)).toBe(false);
        expect(isPossibleMisconception(2, 1)).toBe(true);
    });

    it("keys the profile by concept and mistake type", () => {
        expect(mistakeProfileId("c6-integer-addition", "sign-error")).toBe("c6-integer-addition__sign-error");
    });
});

describe("seeded question bank", () => {
    it("ships analysis for every wrong option of every question", () => {
        const missing = QUESTION_BANK.filter((item) =>
            item.options.some((option) => option.id !== item.correctOptionId && !item.optionAnalysis?.[option.id]));
        expect(missing).toEqual([]);
    });

    it("keeps analysis aligned with the concept it belongs to", () => {
        for (const item of getQuestionsForConcept("c8-ratio-basics")) {
            for (const option of item.options) {
                if (option.id === item.correctOptionId) continue;
                expect(item.optionAnalysis?.[option.id]?.mistakeType).toBeTruthy();
            }
        }
    });
});

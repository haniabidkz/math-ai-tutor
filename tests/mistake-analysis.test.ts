import { describe, expect, it } from "vitest";
import {
    buildOptionAnalysis,
    deriveMisconceptionTag,
    getOptionAnalysis,
    isPossibleMisconception,
    MISCONCEPTIONS,
    mistakeProfileId,
} from "@/lib/mistake-analysis";
import { getQuestionsForConcept, QUESTION_BANK } from "@/lib/question-bank";
import type { MistakeType, QuestionBankItem } from "@/types/curriculum";

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

describe("misconception tagging", () => {
    it("detects a sign error when the chosen value is the negation of the answer", () => {
        expect(deriveMisconceptionTag(question(), "B")).toBe("sign-direction");
    });

    it("detects an off-by-one slip", () => {
        expect(deriveMisconceptionTag(question(), "C")).toBe("off-by-one-count");
    });

    it("falls back to the concept family for non-numeric relationships", () => {
        expect(deriveMisconceptionTag(question({ microTag: "c7-coefficients" }), "D")).toBe("coefficient-vs-constant");
        expect(deriveMisconceptionTag(question({ microTag: "c8-solving-proportions" }), "D")).toBe("ratio-order-reversed");
        expect(deriveMisconceptionTag(question({ microTag: "c8-multi-step-equations" }), "D")).toBe("stopped-before-final-step");
    });

    it("maps every misconception tag onto one of the five mistake types", () => {
        const allowed: MistakeType[] = ["concept", "calculation", "sign", "operation", "carelessness"];
        for (const definition of Object.values(MISCONCEPTIONS)) {
            expect(allowed).toContain(definition.mistakeType);
            expect(definition.whyWrong.english.length).toBeGreaterThan(0);
            expect(definition.whyWrong.romanUrdu.length).toBeGreaterThan(0);
            expect(definition.guidance.english.length).toBeGreaterThan(0);
            expect(definition.guidance.romanUrdu.length).toBeGreaterThan(0);
        }
    });
});

describe("option analysis", () => {
    it("never analyses the correct option", () => {
        expect(getOptionAnalysis(question(), "A")).toBeNull();
    });

    it("returns a mistake type, a misconception tag and a why-wrong line", () => {
        const analysis = getOptionAnalysis(question(), "B")!;
        expect(analysis.mistakeType).toBe("sign");
        expect(analysis.misconceptionTag).toBe("sign-direction");
        expect(analysis.whyWrong.english).toContain("correct answer is -2");
    });

    it("prefers authored analysis over the derived fallback", () => {
        const authored = question({
            optionAnalysis: {
                B: {
                    mistakeType: "operation",
                    misconceptionTag: "wrong-operation-choice",
                    whyWrong: { english: "You added instead.", romanUrdu: "Aap ne jama kiya." },
                },
            },
        });
        const analysis = getOptionAnalysis(authored, "B")!;
        expect(analysis.mistakeType).toBe("operation");
        expect(analysis.whyWrong.english).toBe("You added instead.");
    });

    it("builds bilingual analysis for every distractor", () => {
        const analysis = buildOptionAnalysis(question());
        expect(Object.keys(analysis).sort()).toEqual(["B", "C", "D"]);
        for (const entry of Object.values(analysis)) {
            expect(entry.whyWrong.english.length).toBeGreaterThan(0);
            expect(entry.whyWrong.romanUrdu.length).toBeGreaterThan(0);
        }
    });
});

describe("misconception detection", () => {
    it("treats a repeated pattern as a possible misconception", () => {
        expect(isPossibleMisconception(1, 3)).toBe(false);
        expect(isPossibleMisconception(2, 3)).toBe(false);
        expect(isPossibleMisconception(3, 3)).toBe(true);
    });

    it("never triggers on a single mistake even with a low threshold", () => {
        expect(isPossibleMisconception(1, 1)).toBe(false);
        expect(isPossibleMisconception(2, 1)).toBe(true);
    });

    it("keys the profile by concept and misconception tag", () => {
        expect(mistakeProfileId("c6-integer-addition", "sign-direction")).toBe("c6-integer-addition__sign-direction");
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
                expect(item.optionAnalysis?.[option.id]?.misconceptionTag).toBeTruthy();
            }
        }
    });
});

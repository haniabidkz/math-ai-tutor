import { questionFingerprint } from "@/lib/ai-studio/validate";
import type { DraftQuestion, GenerationDraft } from "@/lib/ai-studio/types";
import type { Difficulty } from "@/types/curriculum";

let counter = 0;

/** A complete, checked draft question; override any field to break it. */
export function draftQuestion(overrides: Partial<DraftQuestion> = {}): DraftQuestion {
    counter += 1;
    const base: DraftQuestion = {
        key: `q${counter}`,
        difficulty: "easy",
        microTag: "c6-integers-intro",
        questionText: `Ali has Rs. ${counter * 10}. He spends Rs. 5. How much is left?`,
        options: [`${counter * 10 - 5}`, `${counter * 10 + 5}`, `${counter * 10}`, `${counter * 10 - 10}`],
        correctOption: "A",
        hint: { english: "Take away what he spent.", romanUrdu: "Jo kharch kiya wo nikaal dein." },
        solution: { english: "Subtract 5.", romanUrdu: "5 minus karein." },
        wrongReasons: {
            B: { english: "You added.", romanUrdu: "Aap ne jama kiya.", misconceptionTag: "wrong-operation-choice" },
            C: { english: "Nothing was taken away.", romanUrdu: "Kuch nahin nikala.", misconceptionTag: "stopped-before-final-step" },
            D: { english: "You took away 10.", romanUrdu: "Aap ne 10 nikaal diye.", misconceptionTag: "arithmetic-slip" },
        },
        verification: { status: "agrees", aiAnswer: "A" },
        origin: "ai",
        ...overrides,
    };
    return { ...base, verification: { ...base.verification, fingerprint: questionFingerprint(base) } };
}

/** A micro-topic draft for Class 6 Introduction to Integers with the given counts. */
export function reviewDraft(counts: Record<Difficulty, number>, overrides: Partial<GenerationDraft> = {}): GenerationDraft {
    const questions = (["easy", "medium", "hard"] as Difficulty[]).flatMap((difficulty) =>
        Array.from({ length: counts[difficulty] }, () => draftQuestion({ difficulty })));
    return {
        id: "d1", status: "needs_review", level: "micro", curriculum: "Oxford Countdown",
        target: {
            classLevel: 6, chapter: { topicId: "class6-integers", title: "Integers" }, subTopic: null,
            microTopic: { microTag: "c6-integers-intro", title: "Introduction to Integers" },
            microTopics: [{ microTag: "c6-integers-intro", title: "Introduction to Integers" }],
        },
        quota: { easy: 10, medium: 10, hard: 10 },
        concept: {
            title: "Integers",
            example: { english: "At the bazaar, Ali gets Rs. 10 change.", romanUrdu: "Bazaar mein Ali ko Rs. 10 wapas mile." },
            explanation: { english: "Integers are whole numbers and their negatives.", romanUrdu: "Integers poore number aur un ke manfi hain." },
        },
        questions,
        steps: [], usage: { calls: 0, inputTokens: 0, outputTokens: 0 }, createdBy: "u", createdByEmail: "a@b.c",
        ...overrides,
    };
}

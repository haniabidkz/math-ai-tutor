import { describe, expect, it } from "vitest";
import { findForeignContext } from "@/lib/ai-studio/context-check";
import { aiQuestionId, newConceptFromDraft, toQuestionBankItem } from "@/lib/ai-studio/publish";
import { DEFAULT_QUOTAS, planSteps, quotaFor, quotaTotal } from "@/lib/ai-studio/quotas";
import { normalizeConcept, normalizeQuestionBatch } from "@/lib/ai-studio/schema";
import { buildTarget } from "@/lib/ai-studio/target";
import { NEW_MICRO_TAG } from "@/lib/ai-studio/types";
import { blockingIssues, validateDraft } from "@/lib/ai-studio/validate";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { draftQuestion as question, reviewDraft as draft } from "./fixtures/ai-draft";

describe("question counts per level", () => {
    it("uses the exact counts from the specification", () => {
        expect(DEFAULT_QUOTAS.micro).toEqual({ easy: 10, medium: 10, hard: 10 });
        expect(DEFAULT_QUOTAS.sub).toEqual({ easy: 15, medium: 20, hard: 10 });
        expect(DEFAULT_QUOTAS.main).toEqual({ easy: 20, medium: 20, hard: 20 });
        expect([quotaTotal(DEFAULT_QUOTAS.micro), quotaTotal(DEFAULT_QUOTAS.sub), quotaTotal(DEFAULT_QUOTAS.main)]).toEqual([30, 45, 60]);
    });

    it("reads changed counts from configuration and falls back to the defaults", () => {
        expect(quotaFor("micro", { quotaMicroEasy: 12 } as never)).toEqual({ easy: 12, medium: 10, hard: 10 });
        expect(quotaFor("sub", null)).toEqual(DEFAULT_QUOTAS.sub);
    });

    it("splits the work into batches of at most ten, one difficulty each", () => {
        const steps = planSteps(DEFAULT_QUOTAS.sub);
        expect(steps[0].kind).toBe("concept");
        const batches = steps.filter((step) => step.kind === "questions");
        expect(batches.map((step) => `${step.difficulty}:${step.count}`)).toEqual(["easy:10", "easy:5", "medium:10", "medium:10", "hard:10"]);
        expect(batches.reduce((sum, step) => sum + (step.count ?? 0), 0)).toBe(45);
    });
});

describe("local context check", () => {
    it("flags foreign settings", () => {
        expect(findForeignContext("Tom has $5 and walks 2 miles.")).toEqual(["dollar sign ($)", "miles"]);
        expect(findForeignContext("It is 70 °F at the baseball game.")).toEqual(["Fahrenheit", "American sports"]);
    });

    it("accepts local settings and ordinary words", () => {
        expect(findForeignContext("Sara buys mangoes for Rs. 120 at the bazaar, 3 km away, at 35°C.")).toEqual([]);
        expect(findForeignContext("Ali is 5 feet tall. 40 per cent of the class plays cricket.")).toEqual([]);
    });
});

describe("draft checks (Rule B)", () => {
    it("passes a complete draft with the exact counts", () => {
        expect(blockingIssues(validateDraft(draft({ easy: 10, medium: 10, hard: 10 })))).toEqual([]);
    });

    it("fails when a difficulty has too few or too many questions", () => {
        const issues = blockingIssues(validateDraft(draft({ easy: 9, medium: 11, hard: 10 })));
        expect(issues.map((issue) => issue.message)).toEqual(expect.arrayContaining(["Easy: 9 of 10 questions.", "Medium: 11 of 10 questions."]));
    });

    it("requires both languages for hints, solutions and every wrong-option reason", () => {
        const broken = draft({ easy: 10, medium: 10, hard: 10 });
        broken.questions[0] = question({ hint: { english: "Take away.", romanUrdu: "" } });
        broken.questions[1] = question({ solution: { english: "", romanUrdu: "Hal" } });
        broken.questions[2] = question({ wrongReasons: { B: { english: "x", romanUrdu: "y", misconceptionTag: "arithmetic-slip" } } });
        const messages = blockingIssues(validateDraft(broken)).map((issue) => issue.message);
        expect(messages).toContain("The hint is needed in both English and Roman Urdu.");
        expect(messages).toContain("The step-by-step solution is needed in both English and Roman Urdu.");
        expect(messages).toContain("Option C needs a reason why it is wrong, in both English and Roman Urdu.");
    });

    it("blocks wrong answers found by the independent solve, until confirmed", () => {
        const disputed = draft({ easy: 10, medium: 10, hard: 10 });
        disputed.questions[0] = question({ verification: { status: "disagrees", aiAnswer: "B" } });
        expect(blockingIssues(validateDraft(disputed)).some((issue) => issue.message.includes("chose B"))).toBe(true);
        disputed.questions[0] = question({ verification: { status: "confirmed" } });
        expect(blockingIssues(validateDraft(disputed))).toEqual([]);
    });

    it("asks for a new check after the question is edited", () => {
        const edited = draft({ easy: 10, medium: 10, hard: 10 });
        edited.questions[0] = { ...edited.questions[0], questionText: "Changed after checking" };
        expect(blockingIssues(validateDraft(edited)).some((issue) => issue.message.includes("changed after it was checked"))).toBe(true);
    });

    it("rejects duplicates inside the pool and against the live bank", () => {
        const repeated = draft({ easy: 10, medium: 10, hard: 10 });
        repeated.questions[1] = question({ questionText: repeated.questions[0].questionText });
        const live = new Set([repeated.questions[5].questionText.trim().toLowerCase()]);
        const messages = blockingIssues(validateDraft(repeated, live)).map((issue) => issue.message);
        expect(messages).toContain("This question repeats another one in the pool.");
        expect(messages).toContain("This question is already in the live question bank.");
    });

    it("rejects foreign settings and a missing concept", () => {
        const foreign = draft({ easy: 10, medium: 10, hard: 10 }, { concept: null });
        foreign.questions[0] = question({ questionText: "Tom pays 3 dollars." });
        const messages = blockingIssues(validateDraft(foreign)).map((issue) => issue.message);
        expect(messages.some((message) => message.includes("foreign setting (dollars)"))).toBe(true);
        expect(messages).toContain("The concept explanation has not been written yet.");
    });
});

describe("reading the model's reply", () => {
    const reply = (count: number, overrides: Record<string, unknown> = {}) => ({
        questions: Array.from({ length: count }, (_, index) => ({
            micro_tag: "c6-integers-intro",
            question_text: `What is ${index} + 1?`,
            options: [`${index + 1}`, `${index + 2}`, `${index}`, `${index + 3}`],
            correct_option: "A",
            hint: { english: "Add one.", roman_urdu: "Aik jama karein." },
            step_by_step_explanation: { english: `${index} + 1 = ${index + 1}`, roman_urdu: `${index} + 1 = ${index + 1}` },
            wrong_option_analysis: ["B", "C", "D"].map((option) => ({ option, english: "Off by one.", roman_urdu: "Aik ka farq.", misconception_tag: "off-by-one-count" })),
            ...overrides,
        })),
    });
    const expected = { difficulty: "easy" as const, count: 3, allowedTags: ["c6-integers-intro"] };

    it("accepts a complete batch", () => {
        const result = normalizeQuestionBatch(reply(3), expected);
        expect(result.problems).toEqual([]);
        expect(result.questions).toHaveLength(3);
        expect(result.questions[0].wrongReasons.C?.misconceptionTag).toBe("off-by-one-count");
        expect(result.questions[0].verification.status).toBe("pending");
    });

    it("rejects the whole batch when the count is wrong", () => {
        const result = normalizeQuestionBatch(reply(2), expected);
        expect(result.questions).toEqual([]);
        expect(result.problems[0]).toContain("exactly 3 questions were required but 2 came back");
    });

    it("rejects missing Roman Urdu and missing wrong-option reasons", () => {
        const noUrdu = normalizeQuestionBatch(reply(3, { hint: { english: "Add one.", roman_urdu: "" } }), expected);
        expect(noUrdu.problems.some((problem) => problem.includes("hint in English and Roman Urdu"))).toBe(true);
        const noReasons = normalizeQuestionBatch(reply(3, { wrong_option_analysis: [] }), expected);
        expect(noReasons.problems.some((problem) => problem.includes("why option B, C, D is wrong"))).toBe(true);
    });

    it("ignores a reason given for the correct option", () => {
        const withCorrect = reply(3, {
            wrong_option_analysis: ["A", "B", "C", "D"].map((option) => ({ option, english: "x", roman_urdu: "y", misconception_tag: "arithmetic-slip" })),
        });
        const result = normalizeQuestionBatch(withCorrect, expected);
        expect(result.problems).toEqual([]);
        expect(result.questions[0].wrongReasons.A).toBeUndefined();
    });

    it("reads a concept explanation", () => {
        expect(normalizeConcept({ title: "T", english: "E", roman_urdu: "R", real_life_example: { english: "x", roman_urdu: "y" } }).problems).toEqual([]);
        expect(normalizeConcept({ title: "T", english: "E", roman_urdu: "", real_life_example: { english: "x", roman_urdu: "y" } }).concept).toBeNull();
    });
});

describe("what the questions are filed under", () => {
    const base = { classLevel: 6 as const, chapter: { topicId: "class6-integers", title: "" } };

    it("files a micro-topic pool under the chosen micro-topic", () => {
        const result = buildTarget({ ...base, level: "micro", microTopic: { microTag: "c6-negative-numbers", title: "" } }, MICRO_CONCEPTS);
        expect("target" in result && result.target.microTopics).toEqual([{ microTag: "c6-negative-numbers", title: "Negative Numbers" }]);
    });

    it("holds a new micro-topic under a placeholder until approval, and refuses a duplicate title", () => {
        const fresh = buildTarget({ ...base, level: "micro", microTopic: { microTag: null, title: "Absolute Value" } }, MICRO_CONCEPTS);
        expect("target" in fresh && fresh.target.microTopics).toEqual([{ microTag: NEW_MICRO_TAG, title: "Absolute Value" }]);
        const duplicate = buildTarget({ ...base, level: "micro", microTopic: { microTag: null, title: "negative numbers" } }, MICRO_CONCEPTS);
        expect("error" in duplicate && duplicate.error).toContain("already exists");
    });

    it("spreads a sub-topic pool over the ticked micro-topics only", () => {
        const result = buildTarget({ ...base, level: "sub", subTopic: "Signed numbers", microTags: ["c6-positive-numbers", "c6-negative-numbers"] }, MICRO_CONCEPTS);
        expect("target" in result && result.target.microTopics.map((topic) => topic.microTag)).toEqual(["c6-positive-numbers", "c6-negative-numbers"]);
        expect("error" in buildTarget({ ...base, level: "sub", subTopic: "Signed numbers", microTags: [] }, MICRO_CONCEPTS)).toBe(true);
        expect("error" in buildTarget({ ...base, level: "sub", subTopic: "", microTags: ["c6-positive-numbers"] }, MICRO_CONCEPTS)).toBe(true);
    });

    it("spreads a main-topic pool over the whole chapter and needs an existing chapter", () => {
        const result = buildTarget({ ...base, level: "main" }, MICRO_CONCEPTS);
        expect("target" in result && result.target.microTopics).toHaveLength(7);
        const newChapter = buildTarget({ level: "main", classLevel: 6, chapter: { topicId: null, title: "Fractions" } }, MICRO_CONCEPTS);
        expect("error" in newChapter && newChapter.error).toContain("existing main topic");
    });

    it("rejects a micro-topic from another chapter", () => {
        const result = buildTarget({ ...base, level: "micro", microTopic: { microTag: "c6-constants", title: "" } }, MICRO_CONCEPTS);
        expect("error" in result).toBe(true);
    });
});

describe("publishing", () => {
    it("turns a draft question into a live question with reasons for the three wrong options", () => {
        const item = toQuestionBankItem(question(), { id: "c6-x-ai-1", microTag: "c6-integers-intro", prerequisiteTag: "c5-number-line", classLevel: 6 });
        expect(item.correctOptionId).toBe("A");
        expect(Object.keys(item.optionAnalysis ?? {}).sort()).toEqual(["B", "C", "D"]);
        expect(item.optionAnalysis?.B?.mistakeType).toBe("operation");
        expect(item.source).toBe("oxford");
        expect(item.status).toBe("published");
        expect(item.options.map((option) => option.id)).toEqual(["A", "B", "C", "D"]);
    });

    it("places a new micro-topic at the end of its chapter", () => {
        const concept = newConceptFromDraft(draft({ easy: 0, medium: 0, hard: 0 }, {
            target: {
                classLevel: 6, chapter: { topicId: "class6-integers", title: "Integers" }, subTopic: "Using integers",
                microTopic: { microTag: null, title: "Absolute Value" }, microTopics: [],
            },
        }), MICRO_CONCEPTS);
        expect(concept.microTag).toBe("c6-absolute-value");
        expect(concept.order).toBe(7);
        expect(concept.prerequisiteTag).toBe("c6-integer-subtraction");
        expect(concept.visualKind).toBe("number-line");
        expect(concept.subTopic?.english).toBe("Using integers");
        expect(concept.example?.english).toContain("bazaar");
    });

    it("builds readable question ids", () => {
        expect(aiQuestionId("c6-integers-intro", "3F9A2C1D-77")).toBe("c6-integers-intro-ai-3f9a2c1d");
    });
});

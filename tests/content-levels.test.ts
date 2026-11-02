import { describe, expect, it } from "vitest";
import { conceptPrompt, questionPrompt } from "@/lib/ai-studio/prompts";
import { newConceptFromDraft, placeLesson, toQuestionBankItem } from "@/lib/ai-studio/publish";
import { conceptSchemaFor, normalizeConcept, normalizeQuestionBatch, questionBatchSchema } from "@/lib/ai-studio/schema";
import { withHelp, type GenerationDraft } from "@/lib/ai-studio/types";
import { blockingIssues, validateDraft } from "@/lib/ai-studio/validate";
import { questionInputSchema } from "@/lib/admin-schemas";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { pickPractice } from "@/lib/lesson-steps";
import { questionExplains } from "@/lib/question-level";
import type { MicroConcept } from "@/types/curriculum";
import { draftQuestion as question, reviewDraft as draft } from "./fixtures/ai-draft";

const subTarget: GenerationDraft["target"] = {
    classLevel: 6, chapter: { topicId: "class6-integers", title: "Integers" }, subTopic: "Signed numbers", microTopic: null,
    microTopics: [{ microTag: "c6-integers-intro", title: "Introduction to Integers" }, { microTag: "c6-number-line", title: "Number Line" }],
};

describe("sub-topic and main-topic pools only mark right or wrong", () => {
    it("knows which levels teach", () => {
        expect([withHelp("micro"), withHelp("sub"), withHelp("main")]).toEqual([true, false, false]);
    });

    it("asks the model for a boundary only, and for questions without hints, solutions or reasons", () => {
        const concept = conceptPrompt({ level: "sub", target: subTarget }).user;
        expect(concept).toContain('Explain only the sub-topic "Signed numbers"');
        expect(concept).toContain("Write no explanation");
        expect(concept).not.toContain("- roman_urdu:");
        expect(concept).not.toContain("- real_life_example:");
        expect(conceptPrompt({ level: "micro", target: { ...subTarget, microTopic: { microTag: "c6-integers-intro", title: "Introduction to Integers" } } }).user).toContain("- real_life_example:");

        const questions = questionPrompt({ level: "main", target: { ...subTarget, subTopic: null }, concept: null }, { difficulty: "easy", count: 2, avoid: [] }).user;
        expect(questions).toContain("No hint, solution or wrong-option reasons");
        expect(questions).not.toContain("- hint:");
        expect(questions).not.toContain("- wrong_option_analysis:");
        expect(questionPrompt({ level: "micro", target: subTarget, concept: null }, { difficulty: "easy", count: 2, avoid: [] }).user).toContain("- hint:");
    });

    it("uses schemas without the help fields and accepts replies that leave them out", () => {
        const schema = questionBatchSchema(["c6-integers-intro"], [], false) as { properties: { questions: { items: { required: string[]; properties: Record<string, unknown> } } } };
        expect(schema.properties.questions.items.required).not.toContain("hint");
        expect(schema.properties.questions.items.properties.wrong_option_analysis).toBeUndefined();
        expect((conceptSchemaFor("main") as { required: string[] }).required).toEqual(["title", "covers", "excludes"]);
        expect((conceptSchemaFor("micro") as { required: string[] }).required).toContain("roman_urdu");

        const reply = { questions: [{ micro_tag: "c6-integers-intro", question_text: "What is 3 minus 5?", options: ["-2", "2", "8", "-8"], correct_option: "A" }] };
        const read = normalizeQuestionBatch(reply, { difficulty: "easy", count: 1, allowedTags: ["c6-integers-intro"], withHelp: false });
        expect(read.problems).toEqual([]);
        expect(read.questions[0]).toMatchObject({ hint: { english: "", romanUrdu: "" }, solution: { english: "", romanUrdu: "" }, wrongReasons: {} });
        expect(normalizeQuestionBatch(reply, { difficulty: "easy", count: 1, allowedTags: ["c6-integers-intro"] }).problems.length).toBeGreaterThan(0);

        const scope = normalizeConcept({ title: "Signed numbers", covers: ["read a signed number", "place it on the line"], excludes: ["adding integers", "multiplying integers"] }, false);
        expect(scope.problems).toEqual([]);
        expect(scope.concept).toMatchObject({ title: "Signed numbers", explanation: { english: "", romanUrdu: "" } });
    });

    it("approves a sub-topic draft with no explanation and no help, but still blocks a micro-topic one", () => {
        const bare = { hint: { english: "", romanUrdu: "" }, solution: { english: "", romanUrdu: "" }, wrongReasons: {} };
        const sub = draft({ easy: 1, medium: 0, hard: 0 }, {
            level: "sub",
            target: subTarget,
            quota: { easy: 1, medium: 0, hard: 0 },
            concept: { title: "Signed numbers", example: { english: "", romanUrdu: "" }, explanation: { english: "", romanUrdu: "" }, scope: { covers: ["a"], excludes: ["b"] } },
            questions: [question({ difficulty: "easy", ...bare })],
        });
        expect(blockingIssues(validateDraft(sub))).toEqual([]);
        const micro = { ...sub, level: "micro" as const };
        expect(blockingIssues(validateDraft(micro)).map((issue) => issue.message)).toContain("The hint is needed in both English and Roman Urdu.");
    });

    it("publishes sub-topic and main-topic questions without hint, explanation or reasons, marked with their level", () => {
        const target = { id: "q1", microTag: "c6-integers-intro", prerequisiteTag: null, classLevel: 6 as const };
        const main = toQuestionBankItem(question(), target, "main");
        expect(main).toMatchObject({ level: "main", hint: { english: "", romanUrdu: "" }, explanation: { english: "", romanUrdu: "" } });
        expect("optionAnalysis" in main).toBe(false);
        const micro = toQuestionBankItem(question(), target);
        expect(micro.level).toBe("micro");
        expect(micro.hint.english).not.toBe("");
        expect(Object.keys(micro.optionAnalysis ?? {})).toHaveLength(3);

        expect(questionExplains(main)).toBe(false);
        expect(questionExplains({ level: undefined })).toBe(true);
    });

    it("lets the admin save a sub-topic question without a hint but not a micro-topic one", () => {
        const base = {
            microTag: "c6-integers-intro", classLevel: 6, difficulty: "easy", question: { english: "Q", romanUrdu: "Q" },
            options: [{ id: "A", english: "1", romanUrdu: "1" }, { id: "B", english: "2", romanUrdu: "2" }, { id: "C", english: "3", romanUrdu: "3" }, { id: "D", english: "4", romanUrdu: "4" }],
            correctOptionId: "A", hint: { english: "", romanUrdu: "" }, explanation: { english: "", romanUrdu: "" }, source: "oxford",
        };
        expect(questionInputSchema.safeParse({ ...base, level: "sub" }).success).toBe(true);
        expect(questionInputSchema.safeParse(base).success).toBe(false);
    });

    it("prefers questions that explain themselves for lesson practice", () => {
        const target = { id: "", microTag: "c6-integers-intro", prerequisiteTag: null, classLevel: 6 as const };
        const marking = toQuestionBankItem(question(), { ...target, id: "m1" }, "sub");
        const teaching = toQuestionBankItem(question(), { ...target, id: "t1" });
        expect(pickPractice([marking, teaching, marking], 2).map((item) => item.id)).toEqual(["t1"]);
        expect(pickPractice([marking], 1).map((item) => item.id)).toEqual(["m1"]);
    });
});

describe("placing a new lesson by the textbook", () => {
    const base = draft({ easy: 0, medium: 0, hard: 0 }, {
        target: {
            classLevel: 6, chapter: { topicId: "class6-integers", title: "Integers" }, subTopic: "Using integers",
            microTopic: { microTag: null, title: "Absolute Value" }, microTopics: [],
        },
    });

    it("puts the lesson at the asked position and moves the lessons after it down", () => {
        const fresh = newConceptFromDraft(base, MICRO_CONCEPTS);
        const chapter = MICRO_CONCEPTS.filter((concept) => concept.topicId === "class6-integers");
        const { concept, shifts } = placeLesson(fresh, MICRO_CONCEPTS, { chapterIndex: 0, lessonIndex: 2, subTopic: null, source: "ai", note: "After the number line." });
        expect(concept.order).toBe(2);
        expect(concept.prerequisiteTag).toBe(chapter.find((item) => item.order === 1)?.microTag);
        expect(concept.sequence).toMatchObject({ source: "ai", note: "After the number line." });
        for (const lesson of chapter) {
            if (lesson.order >= 2) expect(shifts.get(lesson.microTag)).toEqual({ order: lesson.order + 1 });
            else expect(shifts.has(lesson.microTag)).toBe(false);
        }
    });

    it("leaves a lesson at the end, unconfirmed, when the position is unknown", () => {
        const fresh = newConceptFromDraft(base, MICRO_CONCEPTS);
        const { concept, shifts } = placeLesson(fresh, MICRO_CONCEPTS, { chapterIndex: 0, lessonIndex: 99, subTopic: null, source: "unknown", note: "" });
        expect(concept.order).toBe(MICRO_CONCEPTS.filter((item) => item.topicId === "class6-integers").length);
        expect(concept.sequence?.source).toBe("unknown");
        expect(shifts.size).toBe(0);
    });

    it("slots a new chapter among the class's chapters and moves the later ones down", () => {
        const text = (english: string) => ({ english, romanUrdu: english });
        const lesson = (microTag: string, topicId: string, topicOrder: number): MicroConcept => ({
            microTag, prerequisiteTag: null, classLevel: 6, topicId, topicTitle: text(topicId), title: text(microTag), concept: text("…"),
            family: "algebra", visualKind: "expression", order: 0, topicOrder, status: "published",
        });
        const existing = [lesson("a-1", "chapter-a", 0), lesson("b-1", "chapter-b", 1), lesson("c-1", "chapter-c", 2)];
        const fresh = { ...lesson("n-1", "chapter-new", 9), topicOrder: 9 };
        const { concept, shifts } = placeLesson(fresh, existing, { chapterIndex: 1, lessonIndex: 0, subTopic: "First steps", source: "ai", note: "" });
        expect(concept).toMatchObject({ topicOrder: 1, order: 0, subTopic: { english: "First steps" } });
        expect([...shifts.entries()]).toEqual([["b-1", { topicOrder: 2 }], ["c-1", { topicOrder: 3 }]]);
    });
});

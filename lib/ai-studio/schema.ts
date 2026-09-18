import { randomUUID } from "node:crypto";
import { MISCONCEPTION_TAGS } from "@/lib/mistake-analysis";
import { OPTION_LETTERS, type DraftConcept, type DraftQuestion, type OptionLetter } from "@/lib/ai-studio/types";
import { stripOptionLabel } from "@/lib/ai-studio/validate";
import type { Difficulty, MisconceptionTag } from "@/types/curriculum";

/**
 * JSON schemas the model must follow (OpenAI strict mode) and the code that turns its replies
 * into draft content, rejecting anything incomplete so the batch can be retried.
 */

const bilingual = {
    type: "object",
    additionalProperties: false,
    required: ["english", "roman_urdu"],
    properties: { english: { type: "string" }, roman_urdu: { type: "string" } },
};

export const conceptSchema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "real_life_example", "english", "roman_urdu"],
    properties: {
        title: { type: "string" },
        real_life_example: bilingual,
        english: { type: "string" },
        roman_urdu: { type: "string" },
    },
};

export function questionBatchSchema(allowedTags: string[]) {
    return {
        type: "object",
        additionalProperties: false,
        required: ["questions"],
        properties: {
            questions: {
                type: "array",
                items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["micro_tag", "question_text", "options", "correct_option", "hint", "step_by_step_explanation", "wrong_option_analysis"],
                    properties: {
                        micro_tag: { type: "string", enum: allowedTags },
                        question_text: { type: "string" },
                        options: { type: "array", items: { type: "string" } },
                        correct_option: { type: "string", enum: OPTION_LETTERS },
                        hint: bilingual,
                        step_by_step_explanation: bilingual,
                        wrong_option_analysis: {
                            type: "array",
                            items: {
                                type: "object",
                                additionalProperties: false,
                                required: ["option", "english", "roman_urdu", "misconception_tag"],
                                properties: {
                                    option: { type: "string", enum: OPTION_LETTERS },
                                    english: { type: "string" },
                                    roman_urdu: { type: "string" },
                                    misconception_tag: { type: "string", enum: MISCONCEPTION_TAGS },
                                },
                            },
                        },
                    },
                },
            },
        },
    };
}

export const verificationSchema = {
    type: "object",
    additionalProperties: false,
    required: ["answers"],
    properties: {
        answers: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "working", "answer", "chosen_option"],
                properties: {
                    id: { type: "string" },
                    working: { type: "string" },
                    // The checker's own final answer, before it looks for a matching option.
                    answer: { type: "string" },
                    // "none" when no option equals the checker's answer, so a broken question is caught.
                    chosen_option: { type: "string", enum: [...OPTION_LETTERS, "none"] },
                },
            },
        },
    },
};

interface RawBilingual { english?: unknown; roman_urdu?: unknown }
interface RawQuestion {
    micro_tag?: unknown;
    question_text?: unknown;
    options?: unknown;
    correct_option?: unknown;
    hint?: RawBilingual;
    step_by_step_explanation?: RawBilingual;
    wrong_option_analysis?: Array<{ option?: unknown; english?: unknown; roman_urdu?: unknown; misconception_tag?: unknown }>;
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const pair = (value: RawBilingual | undefined) => ({ english: text(value?.english), romanUrdu: text(value?.roman_urdu) });

export function normalizeConcept(raw: unknown): { concept: DraftConcept | null; problems: string[] } {
    const data = (raw ?? {}) as { title?: unknown; real_life_example?: RawBilingual; english?: unknown; roman_urdu?: unknown };
    const concept: DraftConcept = {
        title: text(data.title),
        example: pair(data.real_life_example),
        explanation: { english: text(data.english), romanUrdu: text(data.roman_urdu) },
    };
    const problems: string[] = [];
    if (!concept.title) problems.push("the concept title is empty");
    if (!concept.explanation.english || !concept.explanation.romanUrdu) problems.push("the explanation must be in both English and Roman Urdu");
    if (!concept.example.english || !concept.example.romanUrdu) problems.push("the real-life example must be in both English and Roman Urdu");
    return { concept: problems.length ? null : concept, problems };
}

/**
 * Converts one batch reply into draft questions. The batch is rejected as a whole when the
 * count is wrong or any question is incomplete, so it can be regenerated with the reasons.
 */
export function normalizeQuestionBatch(
    raw: unknown,
    expected: { difficulty: Difficulty; count: number; allowedTags: string[] },
    makeKey: () => string = () => randomUUID(),
): { questions: DraftQuestion[]; problems: string[] } {
    const items = Array.isArray((raw as { questions?: unknown })?.questions) ? (raw as { questions: RawQuestion[] }).questions : [];
    const problems: string[] = [];
    if (items.length !== expected.count) problems.push(`exactly ${expected.count} questions were required but ${items.length} came back`);

    const questions: DraftQuestion[] = items.map((item, index) => {
        const label = `question ${index + 1}`;
        const options = Array.isArray(item.options) ? item.options.map((option) => stripOptionLabel(text(option))) : [];
        const correct = text(item.correct_option) as OptionLetter;
        const microTag = text(item.micro_tag);

        if (!text(item.question_text)) problems.push(`${label} has no question text`);
        if (options.length !== 4 || options.some((option) => !option)) problems.push(`${label} must have exactly 4 filled options`);
        else if (new Set(options.map((option) => option.toLowerCase())).size !== 4) problems.push(`${label} has repeated options`);
        if (!OPTION_LETTERS.includes(correct)) problems.push(`${label} has no valid correct option`);
        if (!expected.allowedTags.includes(microTag)) problems.push(`${label} is filed under an unknown micro-topic`);

        const hint = pair(item.hint);
        const solution = pair(item.step_by_step_explanation);
        if (!hint.english || !hint.romanUrdu) problems.push(`${label} needs a hint in English and Roman Urdu`);
        if (!solution.english || !solution.romanUrdu) problems.push(`${label} needs a step-by-step solution in English and Roman Urdu`);

        const wrongReasons: DraftQuestion["wrongReasons"] = {};
        for (const reason of item.wrong_option_analysis ?? []) {
            const letter = text(reason.option) as OptionLetter;
            if (!OPTION_LETTERS.includes(letter) || letter === correct) continue;
            wrongReasons[letter] = {
                english: text(reason.english),
                romanUrdu: text(reason.roman_urdu),
                misconceptionTag: (MISCONCEPTION_TAGS.includes(text(reason.misconception_tag) as MisconceptionTag)
                    ? text(reason.misconception_tag)
                    : "arithmetic-slip") as MisconceptionTag,
            };
        }
        const missing = OPTION_LETTERS.filter((letter) => letter !== correct && (!wrongReasons[letter]?.english || !wrongReasons[letter]?.romanUrdu));
        if (OPTION_LETTERS.includes(correct) && missing.length) problems.push(`${label} is missing why option ${missing.join(", ")} is wrong`);

        return {
            key: makeKey(),
            difficulty: expected.difficulty,
            microTag,
            questionText: text(item.question_text),
            options,
            correctOption: correct,
            hint,
            solution,
            wrongReasons,
            verification: { status: "pending" },
            origin: "ai",
        } satisfies DraftQuestion;
    });

    return { questions: problems.length ? [] : questions, problems };
}

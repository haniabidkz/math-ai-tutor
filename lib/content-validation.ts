import { z } from "zod";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { QUESTION_BANK } from "@/lib/question-bank";

const localizedSchema = z.object({ english: z.string().min(1), romanUrdu: z.string().min(1) });
const questionSchema = z.object({
    id: z.string().min(1),
    microTag: z.string().min(1),
    prerequisiteTag: z.string().nullable(),
    classLevel: z.number().int().min(5).max(8),
    difficulty: z.enum(["easy", "medium", "hard"]),
    question: localizedSchema,
    options: z.array(z.object({ id: z.enum(["A", "B", "C", "D"]), english: z.string().min(1), romanUrdu: z.string().min(1) })).length(4),
    correctOptionId: z.enum(["A", "B", "C", "D"]),
    hint: localizedSchema,
    explanation: localizedSchema,
    source: z.enum(["sindh", "oxford"]),
    status: z.enum(["draft", "published", "archived"]),
    version: z.number().int().positive(),
});

export interface ContentValidationResult {
    valid: boolean;
    errors: string[];
    conceptCount: number;
    questionCount: number;
}

export function validateContentBank(): ContentValidationResult {
    const errors: string[] = [];
    const tags = new Set(MICRO_CONCEPTS.map((concept) => concept.microTag));
    const ids = new Set<string>();
    const normalizedQuestions = new Set<string>();

    for (const concept of MICRO_CONCEPTS) {
        if (concept.prerequisiteTag && !tags.has(concept.prerequisiteTag)) {
            errors.push(`${concept.microTag}: missing prerequisite ${concept.prerequisiteTag}`);
        }
        const seen = new Set<string>();
        let cursor: string | null = concept.microTag;
        while (cursor) {
            if (seen.has(cursor)) {
                errors.push(`${concept.microTag}: prerequisite cycle detected`);
                break;
            }
            seen.add(cursor);
            cursor = MICRO_CONCEPTS.find((item) => item.microTag === cursor)?.prerequisiteTag ?? null;
        }
    }

    for (const question of QUESTION_BANK) {
        const parsed = questionSchema.safeParse(question);
        if (!parsed.success) {
            errors.push(`${question.id}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
            continue;
        }
        if (ids.has(question.id)) errors.push(`${question.id}: duplicate id`);
        ids.add(question.id);
        if (!tags.has(question.microTag)) errors.push(`${question.id}: invalid microTag`);
        if (!question.options.some((option) => option.id === question.correctOptionId)) {
            errors.push(`${question.id}: correct option is missing`);
        }
        if (new Set(question.options.map((option) => option.english.trim().toLowerCase())).size !== 4) {
            errors.push(`${question.id}: duplicate options`);
        }
        const normalized = `${question.microTag}:${question.question.english.trim().toLowerCase()}`;
        if (normalizedQuestions.has(normalized)) errors.push(`${question.id}: duplicate question text`);
        normalizedQuestions.add(normalized);
    }

    for (const concept of MICRO_CONCEPTS) {
        const questions = QUESTION_BANK.filter((question) => question.microTag === concept.microTag);
        if (questions.length < 10) errors.push(`${concept.microTag}: requires at least 10 MVP questions`);
        for (const difficulty of ["easy", "medium", "hard"] as const) {
            if (!questions.some((question) => question.difficulty === difficulty)) {
                errors.push(`${concept.microTag}: missing ${difficulty} questions`);
            }
        }
    }

    return { valid: errors.length === 0, errors, conceptCount: MICRO_CONCEPTS.length, questionCount: QUESTION_BANK.length };
}

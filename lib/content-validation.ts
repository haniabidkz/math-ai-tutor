import { z } from "zod";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { QUESTION_BANK } from "@/lib/question-bank";
import type { MicroConcept, QuestionBankItem } from "@/types/curriculum";

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

export function validateContentBank(
    concepts: MicroConcept[] = MICRO_CONCEPTS,
    questionBank: QuestionBankItem[] = QUESTION_BANK,
): ContentValidationResult {
    const errors: string[] = [];
    const tags = new Set(concepts.map((concept) => concept.microTag));
    const conceptsByTag = new Map(concepts.map((concept) => [concept.microTag, concept]));
    const ids = new Set<string>();
    const normalizedQuestions = new Set<string>();

    for (const concept of concepts) {
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
            cursor = concepts.find((item) => item.microTag === cursor)?.prerequisiteTag ?? null;
        }
    }

    for (const question of questionBank) {
        const parsed = questionSchema.safeParse(question);
        if (!parsed.success) {
            errors.push(`${question.id}: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
            continue;
        }
        if (ids.has(question.id)) errors.push(`${question.id}: duplicate id`);
        ids.add(question.id);
        if (!tags.has(question.microTag)) errors.push(`${question.id}: invalid microTag`);
        const concept = conceptsByTag.get(question.microTag);
        if (concept && question.classLevel !== concept.classLevel) {
            errors.push(`${question.id}: Class ${question.classLevel} does not match ${question.microTag} (Class ${concept.classLevel})`);
        }
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

    for (const concept of concepts) {
        const questions = questionBank.filter((question) => question.microTag === concept.microTag);
        if (questions.length < 10) errors.push(`${concept.microTag}: requires at least 10 MVP questions`);
        for (const difficulty of ["easy", "medium", "hard"] as const) {
            if (!questions.some((question) => question.difficulty === difficulty)) {
                errors.push(`${concept.microTag}: missing ${difficulty} questions`);
            }
        }
    }

    return { valid: errors.length === 0, errors, conceptCount: concepts.length, questionCount: questionBank.length };
}

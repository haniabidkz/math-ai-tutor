import { z } from "zod";
import { getClassConcepts, getConcept, MICRO_CONCEPTS } from "@/lib/curriculum";
import { DIAGNOSTIC_QUESTIONS_PER_TOPIC, DIAGNOSTIC_TOPIC_COUNT, getDiagnosticBlueprint } from "@/lib/diagnostic-blueprint";
import { DIAGNOSTIC_QUESTIONS } from "@/lib/diagnostic-questions";
import { QUESTION_BANK } from "@/lib/question-bank";
import type { MicroConcept, QuestionBankItem, StudentClassLevel } from "@/types/curriculum";

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

        // Every distractor must explain the mistake it represents.
        for (const option of question.options) {
            if (option.id === question.correctOptionId) continue;
            const analysis = question.optionAnalysis?.[option.id];
            if (!analysis) {
                errors.push(`${question.id}: option ${option.id} is missing mistake analysis`);
            } else if (!analysis.whyWrong.english.trim() || !analysis.whyWrong.romanUrdu.trim()) {
                errors.push(`${question.id}: option ${option.id} needs a bilingual why-wrong explanation`);
            }
        }
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

/**
 * Each class's diagnostic: five topics of one easy, one medium and one hard question, all on
 * the topic's foundation concept from the previous class, leading into lessons of this class.
 */
export function validateDiagnosticTests(
    tests: Record<StudentClassLevel, QuestionBankItem[]> = DIAGNOSTIC_QUESTIONS,
): string[] {
    const errors: string[] = [];
    for (const classLevel of [6, 7, 8] as const) {
        const blueprint = getDiagnosticBlueprint(classLevel);
        const questions = tests[classLevel];
        const lessons = new Set(getClassConcepts(classLevel).map((concept) => concept.microTag));
        if (blueprint.length !== DIAGNOSTIC_TOPIC_COUNT) errors.push(`Class ${classLevel}: diagnostic needs ${DIAGNOSTIC_TOPIC_COUNT} topics`);
        if (questions.length !== DIAGNOSTIC_TOPIC_COUNT * DIAGNOSTIC_QUESTIONS_PER_TOPIC) {
            errors.push(`Class ${classLevel}: diagnostic has ${questions.length} questions`);
        }
        for (const topic of blueprint) {
            const concept = getConcept(topic.microTag);
            if (!concept) errors.push(`Class ${classLevel} ${topic.topicKey}: unknown concept ${topic.microTag}`);
            else if (concept.classLevel !== classLevel - 1) errors.push(`Class ${classLevel} ${topic.topicKey}: ${topic.microTag} is not a Class ${classLevel - 1} concept`);
            for (const tag of topic.lessonTags) {
                if (!lessons.has(tag)) errors.push(`Class ${classLevel} ${topic.topicKey}: ${tag} is not a Class ${classLevel} lesson`);
            }
            topic.questionIds.forEach((id, position) => {
                const question = questions.find((item) => item.id === id);
                if (!question) return errors.push(`Class ${classLevel}: missing diagnostic question ${id}`);
                if (question.microTag !== topic.microTag) errors.push(`${id}: must test ${topic.microTag}`);
                if (question.difficulty !== (["easy", "medium", "hard"] as const)[position]) errors.push(`${id}: expected ${["easy", "medium", "hard"][position]}`);
                if (question.purpose !== "diagnostic" || question.diagnosticFor !== classLevel) errors.push(`${id}: must be marked as a Class ${classLevel} diagnostic question`);
            });
        }
    }
    return errors;
}

import { z } from "zod";

export const localizedInputSchema = z.object({
    english: z.string().trim().min(1),
    romanUrdu: z.string().trim().min(1),
});

/** Text that may stay empty: sub-topic and main-topic questions carry no hint or explanation. */
export const localizedOptionalSchema = z.object({
    english: z.string().trim(),
    romanUrdu: z.string().trim(),
});

export const mistakeTypeSchema = z.enum(["concept", "calculation", "sign", "operation", "carelessness"]);

export const misconceptionTagSchema = z.enum([
    "sign-direction",
    "wrong-operation-choice",
    "incomplete-inverse-operation",
    "coefficient-vs-constant",
    "ratio-order-reversed",
    "stopped-before-final-step",
    "off-by-one-count",
    "arithmetic-slip",
]);

export const optionAnalysisSchema = z.object({
    mistakeType: mistakeTypeSchema,
    misconceptionTag: misconceptionTagSchema,
    whyWrong: localizedInputSchema,
});

export const questionInputSchema = z.object({
    id: z.string().trim().min(1).optional(),
    microTag: z.string().trim().min(1),
    prerequisiteTag: z.string().trim().nullable().optional(),
    classLevel: z.number().int().min(5).max(8),
    difficulty: z.enum(["easy", "medium", "hard"]),
    question: localizedInputSchema,
    options: z.array(z.object({
        id: z.enum(["A", "B", "C", "D"]),
        english: z.string().trim().min(1),
        romanUrdu: z.string().trim().min(1),
    })).length(4),
    correctOptionId: z.enum(["A", "B", "C", "D"]),
    hint: localizedOptionalSchema,
    explanation: localizedOptionalSchema,
    optionAnalysis: z.record(z.enum(["A", "B", "C", "D"]), optionAnalysisSchema).optional(),
    /** The pool the question was written for; sub-topic and main-topic questions only mark right or wrong. */
    level: z.enum(["micro", "sub", "main"]).optional(),
    source: z.enum(["sindh", "oxford"]),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    version: z.number().int().positive().default(1),
    // Kept on import, so an exported diagnostic question stays out of quizzes when imported again.
    purpose: z.literal("diagnostic").optional(),
    diagnosticFor: z.union([z.literal(6), z.literal(7), z.literal(8)]).optional(),
}).superRefine((question, context) => {
    if (new Set(question.options.map((option) => option.english.toLowerCase())).size !== 4) {
        context.addIssue({ code: "custom", message: "Options must be unique", path: ["options"] });
    }
    if (!question.options.some((option) => option.id === question.correctOptionId)) {
        context.addIssue({ code: "custom", message: "Correct option is missing", path: ["correctOptionId"] });
    }
    if (question.optionAnalysis?.[question.correctOptionId]) {
        context.addIssue({ code: "custom", message: "The correct option cannot carry mistake analysis", path: ["optionAnalysis"] });
    }
    if ((question.level ?? "micro") === "micro") {
        if (!question.hint.english || !question.hint.romanUrdu) context.addIssue({ code: "custom", message: "A micro-topic question needs a hint in English and Roman Urdu", path: ["hint"] });
        if (!question.explanation.english || !question.explanation.romanUrdu) context.addIssue({ code: "custom", message: "A micro-topic question needs an explanation in English and Roman Urdu", path: ["explanation"] });
    }
});

export const conceptInputSchema = z.object({
    microTag: z.string().trim().min(1),
    prerequisiteTag: z.string().trim().nullable(),
    classLevel: z.number().int().min(5).max(8),
    topicId: z.string().trim().min(1),
    topicTitle: localizedInputSchema,
    title: localizedInputSchema,
    concept: localizedInputSchema,
    family: z.enum(["foundation", "integer", "algebra", "equation", "ratio"]),
    visualKind: z.enum(["number-line", "fraction", "expression", "balance", "ratio", "pattern"]),
    imageUrl: z.string().url().optional().or(z.literal("")),
    example: localizedInputSchema.optional(),
    subTopic: localizedInputSchema.optional(),
    order: z.number().int().min(0),
    topicOrder: z.number().int().min(0).optional(),
    /** The sub-topic's place inside the chapter; lessons without one come after those with one. */
    subTopicOrder: z.number().int().min(0).optional(),
    foundationOnly: z.boolean().optional(),
    status: z.enum(["draft", "published", "archived"]),
});

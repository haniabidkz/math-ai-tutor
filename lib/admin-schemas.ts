import { z } from "zod";

export const localizedInputSchema = z.object({
    english: z.string().trim().min(1),
    romanUrdu: z.string().trim().min(1),
});

export const mistakeTypeSchema = z.enum([
    "sign-error",
    "operation-confusion",
    "inverse-operation",
    "coefficient-misread",
    "ratio-order",
    "partial-step",
    "off-by-one",
    "computation",
]);

export const optionAnalysisSchema = z.object({
    mistakeType: mistakeTypeSchema,
    explanation: localizedInputSchema,
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
    hint: localizedInputSchema,
    explanation: localizedInputSchema,
    optionAnalysis: z.record(z.enum(["A", "B", "C", "D"]), optionAnalysisSchema).optional(),
    source: z.enum(["sindh", "oxford"]),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    version: z.number().int().positive().default(1),
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
    order: z.number().int().min(0),
    foundationOnly: z.boolean().optional(),
    status: z.enum(["draft", "published", "archived"]),
});

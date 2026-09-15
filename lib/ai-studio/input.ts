import { z } from "zod";
import { misconceptionTagSchema } from "@/lib/admin-schemas";

/** Request bodies accepted by the AI Studio routes. Edits may be incomplete; checks flag gaps. */

const short = z.string().max(200);
const long = z.string().max(6000);
const letter = z.enum(["A", "B", "C", "D"]);
const pair = z.object({ english: long, romanUrdu: long });

export const createDraftSchema = z.object({
    level: z.enum(["micro", "sub", "main"]),
    classLevel: z.union([z.literal(6), z.literal(7), z.literal(8)]),
    chapter: z.object({ topicId: z.string().trim().min(1).nullable(), title: short }),
    subTopic: short.nullable().optional(),
    microTopic: z.object({ microTag: z.string().trim().min(1).nullable(), title: short }).nullable().optional(),
    microTags: z.array(z.string().max(120)).max(40).optional(),
});

export const draftQuestionEditSchema = z.object({
    key: z.string().min(1).max(80),
    difficulty: z.enum(["easy", "medium", "hard"]),
    microTag: z.string().max(120),
    questionText: long,
    options: z.array(z.string().max(500)).length(4),
    correctOption: letter,
    hint: pair,
    solution: pair,
    wrongReasons: z.record(letter, z.object({ english: long, romanUrdu: long, misconceptionTag: misconceptionTagSchema })),
});

export const draftConceptSchema = z.object({
    title: short,
    example: pair,
    explanation: pair,
});

export const draftEditSchema = z.discriminatedUnion("op", [
    z.object({ op: z.literal("concept"), concept: draftConceptSchema }),
    z.object({ op: z.literal("question"), question: draftQuestionEditSchema }),
    z.object({ op: z.literal("add"), difficulty: z.enum(["easy", "medium", "hard"]) }),
    z.object({ op: z.literal("remove"), key: z.string().min(1) }),
    z.object({ op: z.literal("confirm"), key: z.string().min(1) }),
    z.object({ op: z.literal("recheck"), key: z.string().min(1) }),
    /** Gives up on a failed step so the admin can write those questions by hand. */
    z.object({ op: z.literal("skipStep"), stepId: z.string().min(1) }),
]);

export const approveSchema = z.object({
    /** Micro-topic that already exists: also use the new explanation as its lesson. */
    replaceLesson: z.boolean().optional(),
});

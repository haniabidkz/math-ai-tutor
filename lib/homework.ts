import { z } from "zod";
import { activityDateKey } from "@/lib/gamification";
import type { HomeworkStatus } from "@/types/homework";

export const MIN_HOMEWORK_QUESTIONS = 3;
export const MAX_HOMEWORK_QUESTIONS = 20;
export const MAX_PACKET_MODULES = 10;

/** One module or a packet of several; a single `microTag` is still accepted. */
export const homeworkInputSchema = z.preprocess((value) => {
    if (!value || typeof value !== "object") return value;
    const input = value as Record<string, unknown>;
    if (!Array.isArray(input.microTags) && typeof input.microTag === "string") {
        return { ...input, microTags: [input.microTag] };
    }
    return input;
}, z.object({
    microTags: z.array(z.string().trim().min(1)).min(1, "Choose at least one module").max(MAX_PACKET_MODULES),
    packetTitle: z.string().trim().max(80).optional(),
    classLevel: z.union([z.literal(6), z.literal(7), z.literal(8)]),
    questionCount: z.number().int().min(MIN_HOMEWORK_QUESTIONS).max(MAX_HOMEWORK_QUESTIONS),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD"),
    allStudents: z.boolean().default(true),
    studentUids: z.array(z.string().trim().min(1)).default([]),
    note: z.string().trim().max(280).optional(),
}).superRefine((value, context) => {
    if (!value.allStudents && value.studentUids.length === 0) {
        context.addIssue({ code: "custom", message: "Select at least one student", path: ["studentUids"] });
    }
    if (new Set(value.microTags).size !== value.microTags.length) {
        context.addIssue({ code: "custom", message: "Each module can appear only once in a packet", path: ["microTags"] });
    }
}));

export const ALL_CLASSES = [6, 7, 8] as const;

/**
 * The classes a teacher may assign to. Teachers without assigned classes keep access to
 * every class so they are not locked out before an admin sets them up.
 */
export function effectiveTeacherClasses(assigned: unknown): Array<6 | 7 | 8> {
    const classes = Array.isArray(assigned)
        ? [...new Set(assigned.map(Number))].filter((level): level is 6 | 7 | 8 => level === 6 || level === 7 || level === 8)
        : [];
    return classes.length ? classes.sort() : [...ALL_CLASSES];
}

/** Derives the status shown to the student from their stored homework progress. */
export function homeworkStatus(progress: { completedAt?: unknown; startedAt?: unknown } | undefined): HomeworkStatus {
    if (!progress) return "not_started";
    if (progress.completedAt) return "completed";
    if (progress.startedAt) return "in_progress";
    return "not_started";
}

/** Homework is overdue once the due date has passed and it is still unfinished. */
export function isOverdue(dueDate: string, status: HomeworkStatus, today = activityDateKey()): boolean {
    return status !== "completed" && dueDate < today;
}

export function sortHomework<T extends { dueDate: string; status: HomeworkStatus }>(items: T[]): T[] {
    const rank: Record<HomeworkStatus, number> = { in_progress: 0, not_started: 1, completed: 2 };
    return [...items].sort((left, right) =>
        rank[left.status] - rank[right.status] || left.dueDate.localeCompare(right.dueDate));
}

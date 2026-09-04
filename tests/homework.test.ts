import { describe, expect, it } from "vitest";
import { homeworkInputSchema, homeworkStatus, isOverdue, sortHomework } from "@/lib/homework";
import {
    learningStatus,
    recommendNextLesson,
    type RecommendableConcept,
} from "@/lib/adaptive-recommendation";

const text = (value: string) => ({ english: value, romanUrdu: value });

function concept(overrides: Partial<RecommendableConcept> & { microTag: string }): RecommendableConcept {
    return {
        title: text(overrides.microTag),
        topicTitle: text("Topic"),
        topicId: "topic-1",
        order: 0,
        mastered: false,
        locked: false,
        percentage: 0,
        ...overrides,
    };
}

describe("homework assignment input", () => {
    const valid = { microTag: "c7-coefficients", classLevel: 7 as const, questionCount: 5, dueDate: "2026-09-30", allStudents: true, studentUids: [] };

    it("accepts a whole-class assignment", () => {
        expect(homeworkInputSchema.parse(valid).microTag).toBe("c7-coefficients");
    });

    it("rejects a bad due date", () => {
        expect(() => homeworkInputSchema.parse({ ...valid, dueDate: "30-09-2026" })).toThrow();
    });

    it("rejects question counts outside the allowed range", () => {
        expect(() => homeworkInputSchema.parse({ ...valid, questionCount: 1 })).toThrow();
        expect(() => homeworkInputSchema.parse({ ...valid, questionCount: 50 })).toThrow();
    });

    it("requires named students when the whole class is not assigned", () => {
        expect(() => homeworkInputSchema.parse({ ...valid, allStudents: false, studentUids: [] })).toThrow();
        expect(homeworkInputSchema.parse({ ...valid, allStudents: false, studentUids: ["uid-1"] }).studentUids).toEqual(["uid-1"]);
    });
});

describe("homework status", () => {
    it("moves from not started to in progress to completed", () => {
        expect(homeworkStatus(undefined)).toBe("not_started");
        expect(homeworkStatus({})).toBe("not_started");
        expect(homeworkStatus({ startedAt: new Date() })).toBe("in_progress");
        expect(homeworkStatus({ startedAt: new Date(), completedAt: new Date() })).toBe("completed");
    });

    it("marks unfinished homework overdue only after the due date", () => {
        expect(isOverdue("2026-09-01", "not_started", "2026-09-04")).toBe(true);
        expect(isOverdue("2026-09-04", "not_started", "2026-09-04")).toBe(false);
        expect(isOverdue("2026-09-10", "in_progress", "2026-09-04")).toBe(false);
        expect(isOverdue("2026-09-01", "completed", "2026-09-04")).toBe(false);
    });

    it("puts active work before completed work, then orders by due date", () => {
        const sorted = sortHomework([
            { dueDate: "2026-09-01", status: "completed" as const },
            { dueDate: "2026-09-20", status: "not_started" as const },
            { dueDate: "2026-09-15", status: "in_progress" as const },
            { dueDate: "2026-09-05", status: "not_started" as const },
        ]);
        expect(sorted.map((item) => `${item.status}:${item.dueDate}`)).toEqual([
            "in_progress:2026-09-15",
            "not_started:2026-09-05",
            "not_started:2026-09-20",
            "completed:2026-09-01",
        ]);
    });
});

describe("next lesson recommendation", () => {
    const concepts = [
        concept({ microTag: "a", mastered: true }),
        concept({ microTag: "b" }),
        concept({ microTag: "c" }),
        concept({ microTag: "d", locked: true }),
    ];

    it("prioritises a concept with an open misconception", () => {
        const result = recommendNextLesson({
            concepts,
            misconceptions: [{ microTag: "c", misconceptionTag: "sign-direction", count: 4 }],
        });
        expect(result.concept?.microTag).toBe("c");
        expect(result.reason).toBe("misconception");
    });

    it("ignores misconceptions on mastered or locked concepts", () => {
        const result = recommendNextLesson({
            concepts,
            misconceptions: [
                { microTag: "a", misconceptionTag: "sign-direction", count: 9 },
                { microTag: "d", misconceptionTag: "arithmetic-slip", count: 9 },
            ],
        });
        expect(result.reason).not.toBe("misconception");
    });

    it("falls back to the weakest diagnostic topic", () => {
        const result = recommendNextLesson({
            concepts,
            diagnosticProfile: {
                recommendedMicroTag: "b",
                weakMicroTags: [],
                topicResults: [
                    { topicKey: "t1", title: text("T1"), microTags: ["b"], correct: 3, total: 3, band: "strong" },
                    { topicKey: "t2", title: text("T2"), microTags: ["c"], correct: 0, total: 3, band: "very-weak" },
                ],
            },
        });
        expect(result.concept?.microTag).toBe("c");
        expect(result.reason).toBe("diagnostic-weak-topic");
    });

    it("continues along the path when nothing else applies", () => {
        expect(recommendNextLesson({ concepts }).concept?.microTag).toBe("b");
        expect(recommendNextLesson({ concepts }).reason).toBe("next-in-path");
    });

    it("reports when everything available is mastered", () => {
        const done = recommendNextLesson({ concepts: [concept({ microTag: "a", mastered: true })] });
        expect(done.concept).toBeNull();
        expect(done.reason).toBe("all-mastered");
    });
});

describe("learning status", () => {
    const base = { masteredCount: 0, totalCount: 10, openMisconceptions: 0, quizzesCompleted: 0, diagnosticOverallBand: null };

    it("starts at getting started", () => {
        expect(learningStatus(base)).toBe("getting-started");
    });

    it("flags repeated misconceptions as needing support", () => {
        expect(learningStatus({ ...base, quizzesCompleted: 3, openMisconceptions: 2 })).toBe("needs-support");
    });

    it("flags a weak diagnostic as needing support", () => {
        expect(learningStatus({ ...base, quizzesCompleted: 1, diagnosticOverallBand: "weak" })).toBe("needs-support");
    });

    it("reports on track once most concepts are mastered", () => {
        expect(learningStatus({ ...base, quizzesCompleted: 5, masteredCount: 8 })).toBe("on-track");
    });

    it("reports needs practice in between", () => {
        expect(learningStatus({ ...base, quizzesCompleted: 5, masteredCount: 2, openMisconceptions: 1 })).toBe("needs-practice");
    });
});

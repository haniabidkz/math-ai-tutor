import { describe, expect, it } from "vitest";
import {
    buildConceptItems,
    formatDuration,
    isParentOf,
    MAX_SESSION_SECONDS,
    selectActiveTopics,
    sessionDurationSeconds,
    summarizeSessions,
} from "@/lib/learner-metrics";
import { getClassConcepts } from "@/lib/curriculum";

const minute = 60_000;

describe("time spent", () => {
    it("measures a session from start to finish", () => {
        expect(sessionDurationSeconds(0, 5 * minute)).toBe(300);
    });

    it("caps a session left open so it cannot inflate study time", () => {
        expect(sessionDurationSeconds(0, 10 * 60 * minute)).toBe(MAX_SESSION_SECONDS);
    });

    it("ignores missing or reversed timestamps", () => {
        expect(sessionDurationSeconds(null, 5 * minute)).toBe(0);
        expect(sessionDurationSeconds(5 * minute, 0)).toBe(0);
    });

    it("accepts Firestore-style timestamps", () => {
        const at = (ms: number) => ({ toMillis: () => ms });
        expect(sessionDurationSeconds(at(0), at(2 * minute))).toBe(120);
    });

    it("formats durations for parents", () => {
        expect(formatDuration(45)).toBe("45s");
        expect(formatDuration(12 * 60)).toBe("12 min");
        expect(formatDuration(90 * 60)).toBe("1 h 30 min");
        expect(formatDuration(120 * 60)).toBe("2 h");
    });
});

describe("work summary", () => {
    it("counts accuracy on real questions only and adds up time", () => {
        const summary = summarizeSessions([
            {
                kind: "mastery", status: "completed", startedAt: 0, completedAt: 10 * minute,
                answers: [{ isCorrect: true }, { isCorrect: false }, { isCorrect: true, practice: true }, { isCorrect: true }],
            },
            { kind: "diagnostic", status: "completed", startedAt: 0, completedAt: 5 * minute, answers: [{ isCorrect: false }] },
            { kind: "mastery", status: "active", startedAt: 0, updatedAt: 1 * minute, answers: [] },
        ]);
        expect(summary.answered).toBe(4);
        expect(summary.correct).toBe(2);
        expect(summary.accuracyPercent).toBe(50);
        expect(summary.timeSpentSeconds).toBe(16 * 60);
        expect(summary.quizzesCompleted).toBe(1);
        expect(summary.diagnosticsCompleted).toBe(1);
    });

    it("reports no accuracy before any answers", () => {
        expect(summarizeSessions([]).accuracyPercent).toBeNull();
    });
});

describe("five active topics", () => {
    const item = (microTag: string, overrides: Partial<{ mastered: boolean; locked: boolean; percentage: number }> = {}) =>
        ({ microTag, mastered: false, locked: false, percentage: 0, ...overrides });

    it("always returns exactly five when the class has enough topics", () => {
        const concepts = Array.from({ length: 9 }, (_, index) => item(`t${index}`));
        expect(selectActiveTopics(concepts, null)).toHaveLength(5);
    });

    it("puts the recommendation first, then work in progress, then what is next", () => {
        const concepts = [item("a"), item("b"), item("c", { percentage: 40 }), item("d"), item("e"), item("f")];
        expect(selectActiveTopics(concepts, "d").map((topic) => topic.microTag)).toEqual(["d", "c", "a", "b", "e"]);
    });

    it("fills with upcoming and then mastered topics near the end of the path", () => {
        const concepts = [
            item("done1", { mastered: true }), item("done2", { mastered: true }), item("done3", { mastered: true }),
            item("open"), item("next", { locked: true }), item("done4", { mastered: true }),
        ];
        expect(selectActiveTopics(concepts, "open").map((topic) => topic.microTag)).toEqual(["open", "next", "done1", "done2", "done3"]);
    });

    it("never repeats a topic", () => {
        const concepts = [item("a", { percentage: 20 }), item("b")];
        expect(selectActiveTopics(concepts, "a").map((topic) => topic.microTag)).toEqual(["a", "b"]);
    });
});

describe("concept progress", () => {
    it("locks a concept until its in-class prerequisite is mastered", () => {
        const concepts = getClassConcepts(6);
        const items = buildConceptItems(concepts, 6, new Map(), new Set());
        const intro = items.find((concept) => concept.microTag === "c6-integers-intro")!;
        const positive = items.find((concept) => concept.microTag === "c6-positive-numbers")!;
        expect(intro.locked).toBe(false);
        expect(positive.locked).toBe(true);

        const unlocked = buildConceptItems(concepts, 6, new Map([["c6-integers-intro", { mastered: true, percentage: 80 }]]), new Set());
        expect(unlocked.find((concept) => concept.microTag === "c6-positive-numbers")!.locked).toBe(false);
        expect(unlocked.find((concept) => concept.microTag === "c6-integers-intro")!.percentage).toBe(80);
    });

    it("unlocks from a strong diagnostic result", () => {
        const items = buildConceptItems(getClassConcepts(6), 6, new Map(), new Set(["c6-integers-intro"]));
        expect(items.find((concept) => concept.microTag === "c6-positive-numbers")!.locked).toBe(false);
    });
});

describe("parent link", () => {
    it("matches a parent regardless of case and spacing", () => {
        expect(isParentOf("parent@example.com", "Parent@Example.com ")).toBe(true);
    });

    it("rejects a different or missing email", () => {
        expect(isParentOf("parent@example.com", "other@example.com")).toBe(false);
        expect(isParentOf("", "")).toBe(false);
        expect(isParentOf("parent@example.com", undefined)).toBe(false);
    });
});

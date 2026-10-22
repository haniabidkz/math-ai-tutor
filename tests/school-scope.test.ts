import { describe, expect, it } from "vitest";
import { homeworkReachesStudent } from "@/lib/homework";
import { boardId } from "@/lib/leaderboard";
import { buildConceptItems, chapterIndexes, lessonPositions } from "@/lib/learner-metrics";
import { getClassConcepts } from "@/lib/curriculum";

describe("homework audience", () => {
    const student = { uid: "u1", classLevel: 6, schoolId: "sch_a", sectionId: "sec_6a" };

    it("reaches the class inside the same school, and a chosen section only", () => {
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 6, schoolId: "sch_a" }, student)).toBe(true);
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 6, schoolId: "sch_a", sectionId: "sec_6a" }, student)).toBe(true);
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 6, schoolId: "sch_a", sectionId: "sec_6b" }, student)).toBe(false);
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 7, schoolId: "sch_a" }, student)).toBe(false);
    });

    it("never crosses between schools or between a school and individual students", () => {
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 6, schoolId: "sch_b" }, student)).toBe(false);
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 6 }, student)).toBe(false);
        const individual = { uid: "u2", classLevel: 6, schoolId: null, sectionId: null };
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 6 }, individual)).toBe(true);
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 6, schoolId: null }, individual)).toBe(true);
        expect(homeworkReachesStudent({ allStudents: true, classLevel: 6, schoolId: "sch_a" }, individual)).toBe(false);
    });

    it("reaches a student named on the homework whatever the class", () => {
        expect(homeworkReachesStudent({ allStudents: false, classLevel: 7, studentUids: ["u1"] }, student)).toBe(true);
        expect(homeworkReachesStudent({ allStudents: false, classLevel: 6, studentUids: ["u9"] }, student)).toBe(false);
    });
});

describe("leaderboard scope", () => {
    it("keeps the public board id and gives each school its own", () => {
        expect(boardId("2026-10-19", 6)).toBe("2026-10-19_6");
        expect(boardId("2026-10-19", 6, null)).toBe("2026-10-19_6");
        expect(boardId("2026-10-19", 6, "sch_a")).toBe("2026-10-19_6_sch_a");
    });
});

describe("premium locks on the lesson path", () => {
    const concepts = getClassConcepts(6);
    const chapters = chapterIndexes(concepts, 6);
    const noProgress = new Map<string, { mastered?: boolean; percentage?: number }>();

    it("numbers chapters in teaching order", () => {
        expect([...chapters.values()]).toEqual([...chapters.values()].sort((left, right) => left - right));
        expect(chapters.get(concepts[0].topicId)).toBe(0);
    });

    it("numbers lessons inside their chapter", () => {
        const positions = lessonPositions(concepts, 6);
        expect(positions.get(concepts[0].microTag)).toEqual({ chapterIndex: 0, lessonIndex: 0 });
        const firstChapter = [...positions.values()].filter((position) => position.chapterIndex === 0).map((position) => position.lessonIndex);
        expect(firstChapter).toEqual(firstChapter.map((_, index) => index));
    });

    it("locks every lesson past the lesson limit of a free chapter", () => {
        const items = buildConceptItems(concepts, 6, noProgress, new Set(), { curriculum: "basic", freeChapterCount: 1, freeLessonsPerChapter: 2 });
        const firstChapter = items.filter((item) => item.chapterIndex === 0);
        expect(firstChapter.slice(0, 2).every((item) => item.lockReason !== "premium")).toBe(true);
        expect(firstChapter.slice(2).every((item) => item.lockReason === "premium")).toBe(true);
    });

    it("locks every chapter after the free ones for basic access and explains why", () => {
        const items = buildConceptItems(concepts, 6, noProgress, new Set(), { curriculum: "basic", freeChapterCount: 1, freeLessonsPerChapter: 0 });
        const firstChapter = items.filter((item) => item.chapterIndex === 0);
        const later = items.filter((item) => item.chapterIndex > 0);
        expect(later.length).toBeGreaterThan(0);
        expect(later.every((item) => item.locked && item.lockReason === "premium" && item.blockedBy === null)).toBe(true);
        expect(firstChapter[0]).toMatchObject({ locked: false, lockReason: null });
        expect(firstChapter.slice(1).every((item) => item.lockReason === "sequence")).toBe(true);
    });

    it("changes nothing for full access", () => {
        const full = buildConceptItems(concepts, 6, noProgress, new Set(), { curriculum: "full", freeChapterCount: 1, freeLessonsPerChapter: 0 });
        const legacy = buildConceptItems(concepts, 6, noProgress, new Set());
        expect(full.map((item) => [item.microTag, item.locked, item.blockedBy?.microTag ?? null]))
            .toEqual(legacy.map((item) => [item.microTag, item.locked, item.blockedBy?.microTag ?? null]));
        expect(full.some((item) => item.lockReason === "premium")).toBe(false);
    });
});

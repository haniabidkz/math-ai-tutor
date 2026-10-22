import { describe, expect, it } from "vitest";
import {
    effectivePlan, freeScopeLabel, isChapterOpen, isLessonOpen, normalizeAccessSettings, premiumLockMessage, resolveStudentAccess, teacherCanAssignLockedLessons, trialDaysLeft,
    type SchoolPlanInfo,
} from "@/lib/access";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 21, 9, 0, 0);
const school = (overrides: Partial<SchoolPlanInfo> = {}): SchoolPlanInfo =>
    ({ plan: "trial", trialEndsAt: now + 5 * DAY, paidUntil: null, trialFullAccess: false, status: "active", ...overrides });
const settings = { freeChapterCount: 1, freeLessonsPerChapter: 0 };

describe("school plans", () => {
    it("runs a trial until its end date and then expires", () => {
        expect(effectivePlan(school(), now)).toBe("trial");
        expect(effectivePlan(school({ trialEndsAt: now - 1 }), now)).toBe("expired");
        expect(trialDaysLeft(now + 5 * DAY, now)).toBe(5);
        expect(trialDaysLeft(now - DAY, now)).toBe(0);
    });

    it("keeps a paid plan until its paid-until date", () => {
        expect(effectivePlan(school({ plan: "paid" }), now)).toBe("paid");
        expect(effectivePlan(school({ plan: "paid", paidUntil: now + DAY }), now)).toBe("paid");
        expect(effectivePlan(school({ plan: "paid", paidUntil: now - DAY }), now)).toBe("expired");
        expect(effectivePlan(null, now)).toBe("expired");
    });
});

describe("student access", () => {
    it("keeps every individual student on the full curriculum unless unticked", () => {
        expect(resolveStudentAccess({ membershipPaid: undefined, schoolId: null, school: null, settings })).toMatchObject({ premium: true, curriculum: "full", source: "individual" });
        expect(resolveStudentAccess({ membershipPaid: true, schoolId: null, school: null, settings })).toMatchObject({ premium: true });
        expect(resolveStudentAccess({ membershipPaid: false, schoolId: null, school: null, settings })).toMatchObject({ premium: false, curriculum: "basic", source: "individual-free" });
    });

    it("gives school students the free chapters on trial and after expiry, everything on a paid plan", () => {
        expect(resolveStudentAccess({ membershipPaid: undefined, schoolId: "s1", school: school(), settings, now })).toMatchObject({ premium: false, source: "school-trial", plan: "trial" });
        expect(resolveStudentAccess({ membershipPaid: undefined, schoolId: "s1", school: school({ trialEndsAt: now - DAY }), settings, now })).toMatchObject({ premium: false, source: "school-expired", plan: "expired" });
        expect(resolveStudentAccess({ membershipPaid: undefined, schoolId: "s1", school: school({ plan: "paid" }), settings, now })).toMatchObject({ premium: true, source: "school-paid" });
    });

    it("lets an individually paid school student and a demo trial open everything", () => {
        expect(resolveStudentAccess({ membershipPaid: true, schoolId: "s1", school: school({ trialEndsAt: now - DAY }), settings, now })).toMatchObject({ premium: true, source: "individual" });
        expect(resolveStudentAccess({ membershipPaid: undefined, schoolId: "s1", school: school({ trialFullAccess: true }), settings, now })).toMatchObject({ premium: true, source: "school-trial-demo" });
    });

    it("opens only the first chapters for basic access", () => {
        const basic = resolveStudentAccess({ membershipPaid: undefined, schoolId: "s1", school: school(), settings: { freeChapterCount: 2, freeLessonsPerChapter: 0 }, now });
        expect(isChapterOpen(0, basic)).toBe(true);
        expect(isChapterOpen(1, basic)).toBe(true);
        expect(isChapterOpen(2, basic)).toBe(false);
        expect(isLessonOpen(1, 8, basic)).toBe(true);
        const full = resolveStudentAccess({ membershipPaid: undefined, schoolId: null, school: null, settings });
        expect(isChapterOpen(9, full)).toBe(true);
        expect(isLessonOpen(9, 9, full)).toBe(true);
    });

    it("limits the lessons inside a free chapter when a lesson limit is set", () => {
        const limited = resolveStudentAccess({ membershipPaid: undefined, schoolId: "s1", school: school(), settings: { freeChapterCount: 1, freeLessonsPerChapter: 2 }, now });
        expect(isLessonOpen(0, 0, limited)).toBe(true);
        expect(isLessonOpen(0, 1, limited)).toBe(true);
        expect(isLessonOpen(0, 2, limited)).toBe(false);
        expect(isLessonOpen(1, 0, limited)).toBe(false);
        expect(freeScopeLabel(limited)).toBe("the first 2 lessons of the first chapter");
        expect(freeScopeLabel({ freeChapterCount: 2, freeLessonsPerChapter: 0 })).toBe("the first 2 chapters");
    });

    it("explains the lock in the student's situation", () => {
        expect(premiumLockMessage({ source: "school-trial", freeChapterCount: 1, freeLessonsPerChapter: 0 })).toContain("trial includes the first chapter");
        expect(premiumLockMessage({ source: "school-trial", freeChapterCount: 1, freeLessonsPerChapter: 3 })).toContain("the first 3 lessons of the first chapter");
        expect(premiumLockMessage({ source: "school-expired", freeChapterCount: 2, freeLessonsPerChapter: 0 })).toContain("plan has ended");
        expect(premiumLockMessage({ source: "individual-free", freeChapterCount: 1, freeLessonsPerChapter: 0 })).toContain("paid plan");
    });

    it("lets expired schools assign the free chapters only", () => {
        expect(teacherCanAssignLockedLessons("trial")).toBe(true);
        expect(teacherCanAssignLockedLessons("paid")).toBe(true);
        expect(teacherCanAssignLockedLessons("expired")).toBe(false);
        expect(teacherCanAssignLockedLessons(null)).toBe(true);
    });

    it("clamps stored settings to their ranges", () => {
        expect(normalizeAccessSettings(null)).toEqual({ freeChapterCount: 1, freeLessonsPerChapter: 0, trialDays: 14, defaultSeatLimit: 100 });
        expect(normalizeAccessSettings({ freeChapterCount: 3, freeLessonsPerChapter: 2, trialDays: 999, defaultSeatLimit: "50" })).toEqual({ freeChapterCount: 3, freeLessonsPerChapter: 2, trialDays: 14, defaultSeatLimit: 50 });
    });
});

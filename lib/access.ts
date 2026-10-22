/**
 * Who may open what. Pure rules shared by the server routes and the screens:
 * a school's plan state, a student's effective access, and the chapters a free or trial
 * student can open.
 */

export type PlanState = "trial" | "paid" | "expired";
export type SchoolStatus = "active" | "suspended";

export interface SchoolPlanInfo {
    plan: PlanState;
    trialEndsAt: number | null;
    paidUntil: number | null;
    /** A demo switch for prospective schools: the trial opens the whole curriculum. */
    trialFullAccess: boolean;
    status: SchoolStatus;
}

export interface AccessSettings {
    /** How many chapters (main topics) of a class a free or trial student can open. */
    freeChapterCount: number;
    /** Inside those chapters, how many lessons (micro-topics) are open; 0 means the whole chapter. */
    freeLessonsPerChapter: number;
    trialDays: number;
    defaultSeatLimit: number;
}

export const DEFAULT_ACCESS_SETTINGS: AccessSettings = { freeChapterCount: 1, freeLessonsPerChapter: 0, trialDays: 14, defaultSeatLimit: 100 };

export const ACCESS_SETTING_LIMITS = {
    freeChapterCount: { min: 0, max: 20, label: "Free chapters per class" },
    freeLessonsPerChapter: { min: 0, max: 50, label: "Free lessons in each free chapter (0 = all)" },
    trialDays: { min: 1, max: 365, label: "Trial length (days)" },
    defaultSeatLimit: { min: 1, max: 100000, label: "Default seat limit for a new school" },
} as const;

export function normalizeAccessSettings(stored: Record<string, unknown> | null | undefined): AccessSettings {
    const settings = { ...DEFAULT_ACCESS_SETTINGS };
    for (const key of Object.keys(ACCESS_SETTING_LIMITS) as Array<keyof AccessSettings>) {
        const { min, max } = ACCESS_SETTING_LIMITS[key];
        const value = Number(stored?.[key]);
        if (Number.isInteger(value) && value >= min && value <= max) settings[key] = value;
    }
    return settings;
}

/** The plan as it stands now: a trial or a paid period that has run out counts as expired. */
export function effectivePlan(school: { plan?: unknown; trialEndsAt?: number | null; paidUntil?: number | null } | null | undefined, now = Date.now()): PlanState {
    if (!school) return "expired";
    if (school.plan === "paid") return school.paidUntil && now > school.paidUntil ? "expired" : "paid";
    if (school.plan === "trial") return school.trialEndsAt && now > school.trialEndsAt ? "expired" : "trial";
    return "expired";
}

export function trialDaysLeft(trialEndsAt: number | null | undefined, now = Date.now()): number {
    if (!trialEndsAt) return 0;
    return Math.max(0, Math.ceil((trialEndsAt - now) / 86_400_000));
}

export type AccessSource = "individual" | "individual-free" | "school-paid" | "school-trial-demo" | "school-trial" | "school-expired";

export interface StudentAccess {
    /** Full curriculum. */
    premium: boolean;
    curriculum: "full" | "basic";
    freeChapterCount: number;
    freeLessonsPerChapter: number;
    source: AccessSource;
    plan: PlanState | null;
}

/**
 * A student without a school is a paid member unless the admin unticked them (the rule the
 * leaderboard has used since 2026-10-11, so nothing changes for today's students). A school
 * student is premium when individually paid, when the school plan is paid, or during a demo
 * trial; otherwise the free chapters only.
 */
export function resolveStudentAccess(input: {
    membershipPaid: unknown;
    schoolId: string | null | undefined;
    school: SchoolPlanInfo | null | undefined;
    settings: Pick<AccessSettings, "freeChapterCount" | "freeLessonsPerChapter">;
    now?: number;
}): StudentAccess {
    const { membershipPaid, schoolId, school, settings } = input;
    const freeChapterCount = settings.freeChapterCount;
    const freeLessonsPerChapter = settings.freeLessonsPerChapter ?? 0;
    const build = (premium: boolean, source: AccessSource, plan: PlanState | null): StudentAccess =>
        ({ premium, curriculum: premium ? "full" : "basic", freeChapterCount, freeLessonsPerChapter, source, plan });

    if (!schoolId) return membershipPaid === false ? build(false, "individual-free", null) : build(true, "individual", null);
    const plan = effectivePlan(school, input.now);
    if (membershipPaid === true) return build(true, "individual", plan);
    if (plan === "paid") return build(true, "school-paid", plan);
    if (plan === "trial") return school?.trialFullAccess ? build(true, "school-trial-demo", plan) : build(false, "school-trial", plan);
    return build(false, "school-expired", plan);
}

/** Chapters are numbered from 0 in teaching order. */
export function isChapterOpen(chapterIndex: number, access: Pick<StudentAccess, "curriculum" | "freeChapterCount">): boolean {
    return access.curriculum === "full" || chapterIndex < access.freeChapterCount;
}

/** A lesson is open when its chapter is free and, if a lesson limit is set, it sits inside that limit. */
export function isLessonOpen(chapterIndex: number, lessonIndex: number, access: Pick<StudentAccess, "curriculum" | "freeChapterCount" | "freeLessonsPerChapter">): boolean {
    if (!isChapterOpen(chapterIndex, access)) return false;
    return access.curriculum === "full" || access.freeLessonsPerChapter <= 0 || lessonIndex < access.freeLessonsPerChapter;
}

export const PREMIUM_LOCK_CODE = "premium";

/** "the first chapter", "the first 2 chapters", "the first 3 lessons of the first chapter". */
export function freeScopeLabel(access: Pick<StudentAccess, "freeChapterCount" | "freeLessonsPerChapter">): string {
    const chapters = access.freeChapterCount === 1 ? "the first chapter" : `the first ${access.freeChapterCount} chapters`;
    if (access.freeLessonsPerChapter > 0) {
        const lessons = access.freeLessonsPerChapter === 1 ? "the first lesson" : `the first ${access.freeLessonsPerChapter} lessons`;
        return `${lessons} of ${chapters}`;
    }
    return chapters;
}

export function premiumLockMessage(access: Pick<StudentAccess, "source" | "freeChapterCount" | "freeLessonsPerChapter">): string {
    const chapters = freeScopeLabel(access);
    const capital = chapters.charAt(0).toUpperCase() + chapters.slice(1);
    switch (access.source) {
        case "school-trial": return `Your school's trial includes ${chapters} of each class. Ask your school to upgrade to open this lesson.`;
        case "school-expired": return `Your school's plan has ended, so only ${chapters} of each class stays open. Ask your school to renew to open this lesson.`;
        default: return `This lesson is part of the paid plan. ${capital} of each class is free.`;
    }
}

/** What teachers may assign: an expired school keeps the free chapters only. */
export function teacherCanAssignLockedLessons(plan: PlanState | null): boolean {
    return plan !== "expired";
}

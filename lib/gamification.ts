import type { LocalizedText } from "@/types/curriculum";

const text = (english: string, romanUrdu: string): LocalizedText => ({ english, romanUrdu });

export const XP_QUIZ_COMPLETED = 10;
export const XP_FIRST_ATTEMPT_CORRECT = 1;

/**
 * A correct answer earns a point only when the student solved it unaided.
 * Hint-assisted and wrong answers earn nothing, matching the scoring spec.
 */
export function answerXp(input: { isCorrect: boolean; hintUsed: boolean }): number {
    return input.isCorrect && !input.hintUsed ? XP_FIRST_ATTEMPT_CORRECT : 0;
}

/** Streak days roll over at local midnight for the product's primary audience. */
export const ACTIVITY_TIME_ZONE = "Asia/Karachi";

export function activityDateKey(date: Date = new Date(), timeZone: string = ACTIVITY_TIME_ZONE): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function keyToUtcMillis(key: string): number {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
}

export function daysBetween(fromKey: string, toKey: string): number {
    return Math.round((keyToUtcMillis(toKey) - keyToUtcMillis(fromKey)) / 86_400_000);
}

export interface StreakState {
    current: number;
    longest: number;
    lastActivityDate: string | null;
}

/**
 * Advances a streak for one day of activity. Same-day activity is idempotent, a
 * consecutive day extends the streak, and any longer gap restarts it at one.
 */
export function nextStreak(state: Partial<StreakState> | null | undefined, todayKey: string): StreakState {
    const current = Math.max(0, Number(state?.current ?? 0));
    const longest = Math.max(0, Number(state?.longest ?? 0));
    const last = state?.lastActivityDate ?? null;

    if (!last) return { current: 1, longest: Math.max(longest, 1), lastActivityDate: todayKey };

    const gap = daysBetween(last, todayKey);
    if (gap === 0) return { current: Math.max(current, 1), longest: Math.max(longest, current, 1), lastActivityDate: last };
    if (gap === 1) {
        const next = current + 1;
        return { current: next, longest: Math.max(longest, next), lastActivityDate: todayKey };
    }
    return { current: 1, longest: Math.max(longest, current, 1), lastActivityDate: todayKey };
}

export interface LearnerStats {
    lessonsCompleted: number;
    quizzesCompleted: number;
    questionsAnswered: number;
    currentStreak: number;
}

export interface BadgeDefinition {
    id: string;
    title: LocalizedText;
    description: LocalizedText;
    icon: string;
    earned: (stats: LearnerStats) => boolean;
}

export const BADGES: BadgeDefinition[] = [
    {
        id: "first-lesson",
        title: text("First Lesson", "Pehla Sabaq"),
        description: text("Completed your first concept lesson.", "Aap ne pehla concept sabaq mukammal kiya."),
        icon: "BookOpen",
        earned: (stats) => stats.lessonsCompleted >= 1,
    },
    {
        id: "first-quiz",
        title: text("First Quiz", "Pehla Quiz"),
        description: text("Finished your first quiz.", "Aap ne pehla quiz mukammal kiya."),
        icon: "ClipboardCheck",
        earned: (stats) => stats.quizzesCompleted >= 1,
    },
    {
        id: "seven-day-streak",
        title: text("7-Day Streak", "7 Din ka Streak"),
        description: text("Learned on seven days in a row.", "Musalsal saat din seekha."),
        icon: "Flame",
        earned: (stats) => stats.currentStreak >= 7,
    },
    {
        id: "fifty-practice-questions",
        title: text("50 Practice Questions", "50 Mashqi Sawal"),
        description: text("Answered fifty practice questions.", "Pachaas mashqi sawal hal kiye."),
        icon: "Target",
        earned: (stats) => stats.questionsAnswered >= 50,
    },
    {
        id: "ten-quizzes",
        title: text("10 Quizzes", "10 Quiz"),
        description: text("Completed ten quizzes.", "Das quiz mukammal kiye."),
        icon: "Trophy",
        earned: (stats) => stats.quizzesCompleted >= 10,
    },
];

export const BADGE_BY_ID = new Map(BADGES.map((badge) => [badge.id, badge]));

export function evaluateBadges(stats: LearnerStats): string[] {
    return BADGES.filter((badge) => badge.earned(stats)).map((badge) => badge.id);
}

/** Returns only the badges that are newly earned, so awards are written once. */
export function newlyEarnedBadges(stats: LearnerStats, alreadyEarned: Iterable<string>): string[] {
    const owned = new Set(alreadyEarned);
    return evaluateBadges(stats).filter((id) => !owned.has(id));
}

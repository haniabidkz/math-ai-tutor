import { activityDateKey, XP_FIRST_ATTEMPT_CORRECT, XP_QUIZ_COMPLETED } from "@/lib/gamification";
import type { LocalizedText } from "@/types/curriculum";

/** Classes that have a leaderboard; each class competes on its own. */
export const LEADERBOARD_CLASSES = [6, 7, 8] as const;
export type LeaderboardClass = (typeof LEADERBOARD_CLASSES)[number];

/** How many students a class board lists; everyone still sees their own rank. */
export const LEADERBOARD_SIZE = 100;
/** The places that qualify for weekly rewards. */
export const REWARD_PLACES = 3;

/** Accuracy streak bonus: every three correct answers in a row inside a quiz; a wrong answer resets the run. */
export const COMBO_RUN_LENGTH = 3;
export const COMBO_POINTS = 5;
/** Once per chapter, when every lesson in it is mastered. */
export const TOPIC_COMPLETION_POINTS = 50;
/** Homework earns up to this many points, by accuracy. */
export const HOMEWORK_MAX_POINTS = 10;
/** A topic can earn points on at most this many days in a week (revision cap). */
export const MAX_SCORING_ATTEMPTS_PER_WEEK = 6;

/** Karachi has no daylight saving, so the week boundary is a fixed offset from UTC. */
const KARACHI_OFFSET_MINUTES = 5 * 60;
const DAY_MS = 86_400_000;
/** The time component of a rank key: seconds into the week, counted down so earlier wins. */
const TIME_SLOTS = 1_000_000;
/** More eligible correct answers than this in one week cannot happen; keeps points the top term. */
const CORRECT_CAP = 9_999;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function isLeaderboardClass(value: unknown): value is LeaderboardClass {
    return (LEADERBOARD_CLASSES as readonly number[]).includes(Number(value));
}

/**
 * A board belongs to a class and, for school students, to their school; individual students
 * share the public board, whose id is unchanged from before schools existed.
 */
export function boardId(weekKey: string, classLevel: number, schoolId?: string | null): string {
    return schoolId ? `${weekKey}_${classLevel}_${schoolId}` : `${weekKey}_${classLevel}`;
}

function keyToUtc(key: string): number {
    const [year, month, day] = key.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
}

function utcToKey(millis: number): string {
    return new Date(millis).toISOString().slice(0, 10);
}

/**
 * The week a moment belongs to, named by its Monday ("2026-10-05"). Weeks run Monday to
 * Sunday in Pakistan time, so the board resets at midnight on Monday for every student.
 */
export function leaderboardWeekKey(date: Date = new Date()): string {
    const todayUtc = keyToUtc(activityDateKey(date));
    const daysSinceMonday = (new Date(todayUtc).getUTCDay() + 6) % 7;
    return utcToKey(todayUtc - daysSinceMonday * DAY_MS);
}

export function previousWeekKey(weekKey: string): string {
    return utcToKey(keyToUtc(weekKey) - 7 * DAY_MS);
}

export function nextWeekKey(weekKey: string): string {
    return utcToKey(keyToUtc(weekKey) + 7 * DAY_MS);
}

/** The seven date keys of a week, Monday first; they match activityDateKey. */
export function weekDateKeys(weekKey: string): string[] {
    const start = keyToUtc(weekKey);
    return Array.from({ length: 7 }, (_, index) => utcToKey(start + index * DAY_MS));
}

/** Monday 00:00 in Karachi, as a UTC timestamp. */
export function weekStartMillis(weekKey: string): number {
    return keyToUtc(weekKey) - KARACHI_OFFSET_MINUTES * 60_000;
}

/** The moment the board resets: the next Monday 00:00 in Karachi. */
export function weekEndMillis(weekKey: string): number {
    return weekStartMillis(nextWeekKey(weekKey));
}

export function isValidWeekKey(value: unknown): value is string {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const utc = keyToUtc(value);
    return Number.isFinite(utc) && utcToKey(utc) === value && new Date(utc).getUTCDay() === 1;
}

/** "6 – 12 Oct 2026", for headings. */
export function weekLabel(weekKey: string): string {
    const start = new Date(keyToUtc(weekKey));
    const end = new Date(keyToUtc(weekKey) + 6 * DAY_MS);
    const month = (date: Date) => MONTHS[date.getUTCMonth()];
    const sameMonth = start.getUTCMonth() === end.getUTCMonth();
    return sameMonth
        ? `${start.getUTCDate()} – ${end.getUTCDate()} ${month(end)} ${end.getUTCFullYear()}`
        : `${start.getUTCDate()} ${month(start)} – ${end.getUTCDate()} ${month(end)} ${end.getUTCFullYear()}`;
}

export function secondsIntoWeek(date: Date, weekKey: string): number {
    const seconds = Math.floor((date.getTime() - weekStartMillis(weekKey)) / 1000);
    return Math.max(0, Math.min(TIME_SLOTS - 1, seconds));
}

/**
 * One number that orders a board: more points first, then more correct answers, then
 * whoever reached that score earlier. A single field keeps the query on an automatic index.
 */
export function rankKey(points: number, correctAnswers: number, seconds: number): number {
    const safePoints = Math.max(0, Math.floor(points));
    const safeCorrect = Math.max(0, Math.min(CORRECT_CAP, Math.floor(correctAnswers)));
    const safeSeconds = Math.max(0, Math.min(TIME_SLOTS - 1, Math.floor(seconds)));
    return safePoints * (CORRECT_CAP + 1) * TIME_SLOTS + safeCorrect * TIME_SLOTS + (TIME_SLOTS - 1 - safeSeconds);
}

export interface LeaderboardEntry {
    uid: string;
    name: string;
    classLevel: LeaderboardClass;
    weekKey: string;
    points: number;
    correctAnswers: number;
    rankKey: number;
    /** When the current score was reached, in UTC milliseconds. */
    lastScoredAt: number;
}

export interface RankedEntry extends LeaderboardEntry {
    rank: number;
}

/** Higher rank key first. */
export function compareEntries(left: Pick<LeaderboardEntry, "rankKey">, right: Pick<LeaderboardEntry, "rankKey">): number {
    return right.rankKey - left.rankKey;
}

export function rankEntries<T extends Pick<LeaderboardEntry, "rankKey">>(entries: T[]): Array<T & { rank: number }> {
    return [...entries].sort(compareEntries).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/** Within a quiz, every run of three correct answers in a row on the lesson's own questions earns a point. */
export function comboBonus(answers: Array<{ isCorrect: boolean; practice?: boolean; foundation?: boolean }>): number {
    let run = 0;
    let bonus = 0;
    for (const answer of answers) {
        if (answer.practice || answer.foundation) continue;
        if (answer.isCorrect) {
            run += 1;
            if (run % COMBO_RUN_LENGTH === 0) bonus += COMBO_POINTS;
        } else {
            run = 0;
        }
    }
    return bonus;
}

/** Homework points by accuracy: 100% earns the maximum, 45% earns about half. */
export function homeworkPoints(percentage: number): number {
    const clamped = Math.max(0, Math.min(100, Number(percentage) || 0));
    return Math.round((clamped / 100) * HOMEWORK_MAX_POINTS);
}

/**
 * A chapter is complete when every lesson in it is mastered. The lesson just mastered counts
 * even before its progress record is written. An unknown chapter (no lessons) never completes.
 */
export function isTopicComplete(lessons: Array<{ microTag: string; mastered: boolean }>, justMastered: string): boolean {
    if (!lessons.length || !lessons.some((lesson) => lesson.microTag === justMastered)) return false;
    return lessons.every((lesson) => lesson.mastered || lesson.microTag === justMastered);
}

export function scoringAttemptsExhausted(scoringDaysThisWeek: number): boolean {
    return scoringDaysThisWeek >= MAX_SCORING_ATTEMPTS_PER_WEEK;
}

export type PointEventKind = "quiz" | "combo" | "topic" | "homework";

/** One line of a student's point history; the id makes every award happen once. */
export interface PointEvent {
    id: string;
    kind: PointEventKind;
    points: number;
    /** Unaided correct answers in an eligible quiz; the tie-breaker on the board. */
    correctAnswers: number;
    label: string;
    sessionId?: string;
    microTag?: string;
    topicId?: string;
    homeworkId?: string;
}

export function pointEventId(kind: PointEventKind, reference: string): string {
    return `${kind}_${reference}`;
}

export interface PointsGrant {
    points: number;
    correctAnswers: number;
    events: PointEvent[];
}

/** Sums the events into the totals the board needs. */
export function grantFromEvents(events: PointEvent[]): PointsGrant {
    return {
        points: events.reduce((sum, event) => sum + event.points, 0),
        correctAnswers: events.reduce((sum, event) => sum + event.correctAnswers, 0),
        events,
    };
}

export type RewardStatus = "pending" | "approved";

export interface RewardCandidate {
    uid: string;
    name: string;
    rank: number;
    points: number;
    correctAnswers: number;
    paid: boolean;
    banned: boolean;
    suspicious: boolean;
}

export interface RewardWinner {
    uid: string;
    name: string;
    place: number;
    rank: number;
    points: number;
    delivered: boolean;
    deliveredAt?: number | null;
}

/**
 * Who may be approved: paid members that are not banned or flagged, in board order. Admins
 * see everyone and choose; this is only the default suggestion.
 */
export function eligibleCandidates(candidates: RewardCandidate[]): RewardCandidate[] {
    return [...candidates]
        .sort((left, right) => left.rank - right.rank)
        .filter((candidate) => candidate.paid && !candidate.banned && !candidate.suspicious)
        .slice(0, REWARD_PLACES);
}

export const text = (english: string, romanUrdu: string): LocalizedText => ({ english, romanUrdu });

/** The rules shown to students, kept in one place so the screen and the server agree. */
export const POINT_RULES: LocalizedText[] = [
    text(`+${XP_FIRST_ATTEMPT_CORRECT} for every correct answer on your first try, +${XP_QUIZ_COMPLETED} for finishing a quiz. Retries and a second quiz on the same topic the same day do not count.`,
        `Pehli koshish mein har sahi jawab par +${XP_FIRST_ATTEMPT_CORRECT}, quiz khatam karne par +${XP_QUIZ_COMPLETED}. Dobara koshish aur usi din usi topic ka doosra quiz nahi ginta.`),
    text(`+${COMBO_POINTS} for every ${COMBO_RUN_LENGTH} correct answers in a row; a wrong answer restarts the count.`, `Lagatar ${COMBO_RUN_LENGTH} sahi jawab par +${COMBO_POINTS}; ghalat jawab par ginti dobara shuru.`),
    text(`+${TOPIC_COMPLETION_POINTS} when you master every lesson of a chapter, once per chapter.`, `Ek chapter ke sab lessons master karne par +${TOPIC_COMPLETION_POINTS}, har chapter par ek baar.`),
    text(`Homework earns up to ${HOMEWORK_MAX_POINTS} points by accuracy.`, `Homework par accuracy ke hisab se ${HOMEWORK_MAX_POINTS} tak points.`),
    text(`A topic can earn points on at most ${MAX_SCORING_ATTEMPTS_PER_WEEK} days a week.`, `Ek topic hafte mein zyada se zyada ${MAX_SCORING_ATTEMPTS_PER_WEEK} din points de sakta hai.`),
    text("Ties: more correct answers wins; then whoever got there first. The board resets every Monday; lifetime XP, badges and streaks stay.",
        "Barabar points: zyada sahi jawab wala aage; phir jo pehle pohncha. Board har Monday reset hota hai; lifetime XP, badges aur streak waise hi rehte hain."),
    text("The same rules apply to free and paid members. The board rewards steady, accurate practice, not only the top scorers.",
        "Free aur paid dono members ke liye same rules. Board lagatar aur sahi practice ka inaam deta hai, sirf top scorers ka nahi."),
];

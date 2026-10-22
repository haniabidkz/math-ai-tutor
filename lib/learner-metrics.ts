import { isLessonOpen, type StudentAccess } from "@/lib/access";
import { compareChapters } from "@/lib/concept-autofill";
import type { LocalizedText, MicroConcept } from "@/types/curriculum";

/**
 * Pure summaries of a learner's work, shared by the student dashboard and the parent portal.
 */

export type TimestampLike = Date | number | string | { toMillis?: () => number; toDate?: () => Date } | null | undefined;

export function toMillis(value: TimestampLike): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (value instanceof Date) return value.getTime();
    if (typeof value.toMillis === "function") return value.toMillis();
    if (typeof value.toDate === "function") return value.toDate().getTime();
    return null;
}

/** A session left open overnight must not count as hours of study. */
export const MAX_SESSION_SECONDS = 45 * 60;

export function sessionDurationSeconds(startedAt: TimestampLike, endedAt: TimestampLike, cap = MAX_SESSION_SECONDS): number {
    const start = toMillis(startedAt);
    const end = toMillis(endedAt);
    if (start === null || end === null || end <= start) return 0;
    return Math.min(cap, Math.round((end - start) / 1000));
}

export interface SessionLike {
    kind?: string;
    status?: string;
    startedAt?: TimestampLike;
    updatedAt?: TimestampLike;
    completedAt?: TimestampLike;
    answers?: Array<{ isCorrect?: boolean; practice?: boolean }>;
}

export interface WorkSummary {
    answered: number;
    correct: number;
    accuracyPercent: number | null;
    timeSpentSeconds: number;
    quizzesCompleted: number;
    diagnosticsCompleted: number;
}

/** Accuracy counts real questions only; misconception practice is excluded. */
export function summarizeSessions(sessions: SessionLike[]): WorkSummary {
    let answered = 0;
    let correct = 0;
    let timeSpentSeconds = 0;
    let quizzesCompleted = 0;
    let diagnosticsCompleted = 0;

    for (const session of sessions) {
        for (const answer of session.answers ?? []) {
            if (answer.practice) continue;
            answered += 1;
            if (answer.isCorrect) correct += 1;
        }
        timeSpentSeconds += sessionDurationSeconds(session.startedAt, session.completedAt ?? session.updatedAt);
        if (session.status === "completed") {
            if (session.kind === "diagnostic") diagnosticsCompleted += 1;
            else quizzesCompleted += 1;
        }
    }

    return {
        answered,
        correct,
        accuracyPercent: answered ? Math.round((correct / answered) * 100) : null,
        timeSpentSeconds,
        quizzesCompleted,
        diagnosticsCompleted,
    };
}

export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export interface TopicCandidate {
    microTag: string;
    mastered: boolean;
    locked: boolean;
    percentage: number;
}

export const ACTIVE_TOPIC_COUNT = 5;

/**
 * Exactly five topics to focus on: the recommended one first, then work already started,
 * then what is unlocked next, then what is coming up, then mastered topics to revise.
 */
export function selectActiveTopics<T extends TopicCandidate>(
    concepts: T[],
    recommendedMicroTag: string | null | undefined,
    count = ACTIVE_TOPIC_COUNT,
): T[] {
    const open = concepts.filter((concept) => !concept.mastered && !concept.locked);
    const ordered = [
        ...open.filter((concept) => concept.microTag === recommendedMicroTag),
        ...open.filter((concept) => concept.microTag !== recommendedMicroTag && concept.percentage > 0),
        ...open.filter((concept) => concept.microTag !== recommendedMicroTag && concept.percentage === 0),
        ...concepts.filter((concept) => !concept.mastered && concept.locked),
        ...concepts.filter((concept) => concept.mastered),
    ];
    const unique: T[] = [];
    for (const concept of ordered) {
        if (!unique.some((item) => item.microTag === concept.microTag)) unique.push(concept);
        if (unique.length === count) break;
    }
    return unique;
}

export interface ConceptProgressItem extends MicroConcept {
    mastered: boolean;
    percentage: number;
    locked: boolean;
    /** Why it is locked: the lesson before it is not done yet, or the chapter is outside the free plan. */
    lockReason: "sequence" | "premium" | null;
    /** The chapter's place in the class, from 0. */
    chapterIndex: number;
    /** The lesson's place inside its chapter, from 0. */
    lessonIndex: number;
    /** The lesson that must be mastered before this one opens, while it is locked. */
    blockedBy: { microTag: string; title: LocalizedText } | null;
}

/** Each chapter's position in the teaching order of a class, from 0. */
export function chapterIndexes(concepts: MicroConcept[], classLevel: number): Map<string, number> {
    const ordered = orderClassConcepts(concepts, classLevel);
    const indexes = new Map<string, number>();
    for (const concept of ordered) if (!indexes.has(concept.topicId)) indexes.set(concept.topicId, indexes.size);
    return indexes;
}

export interface LessonPosition {
    chapterIndex: number;
    lessonIndex: number;
}

/** Where each lesson sits: its chapter's place in the class and its own place inside the chapter. */
export function lessonPositions(concepts: MicroConcept[], classLevel: number): Map<string, LessonPosition> {
    const ordered = orderClassConcepts(concepts, classLevel);
    const chapters = chapterIndexes(concepts, classLevel);
    const seen = new Map<string, number>();
    const positions = new Map<string, LessonPosition>();
    for (const concept of ordered) {
        const lessonIndex = seen.get(concept.topicId) ?? 0;
        seen.set(concept.topicId, lessonIndex + 1);
        positions.set(concept.microTag, { chapterIndex: chapters.get(concept.topicId) ?? 0, lessonIndex });
    }
    return positions;
}

/** True when a free or trial student may open this lesson. */
export function lessonOpenFor(position: LessonPosition | undefined, access: Pick<StudentAccess, "curriculum" | "freeChapterCount" | "freeLessonsPerChapter">): boolean {
    return isLessonOpen(position?.chapterIndex ?? 0, position?.lessonIndex ?? 0, access);
}

/** A class's lessons in the order they are taught: chapter by chapter, and within a chapter in order. */
export function orderClassConcepts(concepts: MicroConcept[], classLevel: number): MicroConcept[] {
    const inClass = concepts.filter((concept) => concept.classLevel === classLevel && !concept.foundationOnly);
    const compare = compareChapters(inClass);
    // Equal orders keep the curriculum's own sequence (the sort is stable).
    return [...inClass].sort((left, right) => compare(left.topicId, right.topicId) || left.order - right.order);
}

/**
 * A class's concepts in path order with mastery and lock state. Lessons unlock one after
 * another: a lesson is locked until the one before it in the path is mastered (or was strong
 * in the diagnostic), and until its in-class prerequisite is, when it names one elsewhere.
 */
export function buildConceptItems(
    concepts: MicroConcept[],
    classLevel: number,
    progress: Map<string, { mastered?: boolean; percentage?: number }>,
    strongTags: Set<string>,
    access?: Pick<StudentAccess, "curriculum" | "freeChapterCount" | "freeLessonsPerChapter"> | null,
): ConceptProgressItem[] {
    const classConcepts = orderClassConcepts(concepts, classLevel);
    const positions = lessonPositions(concepts, classLevel);
    const done = (microTag: string) => progress.get(microTag)?.mastered === true || strongTags.has(microTag);
    return classConcepts.map((concept, index) => {
        const item = progress.get(concept.microTag);
        const previous = index > 0 ? classConcepts[index - 1] : null;
        const prerequisite = concept.prerequisiteTag ? classConcepts.find((candidate) => candidate.microTag === concept.prerequisiteTag) ?? null : null;
        const blockedBy = previous && !done(previous.microTag) ? previous : prerequisite && !done(prerequisite.microTag) ? prerequisite : null;
        const position = positions.get(concept.microTag) ?? { chapterIndex: 0, lessonIndex: 0 };
        // A free or trial student stops at the end of the free lessons, whatever they mastered.
        const premiumLocked = access ? !lessonOpenFor(position, access) : false;
        return {
            ...concept,
            mastered: item?.mastered === true,
            percentage: Number(item?.percentage ?? 0),
            locked: premiumLocked || blockedBy !== null,
            lockReason: premiumLocked ? "premium" : blockedBy ? "sequence" : null,
            chapterIndex: position.chapterIndex,
            lessonIndex: position.lessonIndex,
            blockedBy: !premiumLocked && blockedBy ? { microTag: blockedBy.microTag, title: blockedBy.title } : null,
        };
    });
}

/** Case-insensitive, whitespace-tolerant match between a parent and a child's parent email. */
export function isParentOf(parentEmail: string | null | undefined, childParentEmail: string | null | undefined): boolean {
    const parent = (parentEmail ?? "").trim().toLowerCase();
    const child = (childParentEmail ?? "").trim().toLowerCase();
    return parent.length > 0 && parent === child;
}

import type { MicroConcept } from "@/types/curriculum";

/**
 * The one order every screen uses for lessons: chapters by their place in the class, then
 * sub-topics by their place in the chapter, then lessons by their own place. Ties fall back
 * to creation time, then the tag, so the order never depends on how documents come back
 * from the database or on when the content was generated.
 */

export type SequenceSource = "ai" | "manual" | "unknown";

export interface SequenceInfo {
    source: SequenceSource;
    /** The textbook the order follows, e.g. "Oxford Countdown". */
    textbook?: string;
    note?: string;
    updatedAt?: unknown;
}

export function createdMillis(concept: MicroConcept): number {
    const createdAt = (concept as { createdAt?: { toMillis?: () => number } | number }).createdAt;
    if (typeof createdAt === "number") return createdAt;
    return typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : Infinity;
}

const diff = (left: number, right: number) => (left === right ? 0 : left < right ? -1 : 1);
const subTopicRank = (concept: MicroConcept) => (typeof concept.subTopicOrder === "number" ? concept.subTopicOrder : Infinity);

/**
 * Chapters in teaching order: the chapter order the admin or the textbook set, else the order
 * the chapters were created in, else the id. Within a chapter, lessons follow their own order.
 */
export function compareChapters(concepts: MicroConcept[]): (left: string, right: string) => number {
    const rank = new Map<string, [number, number]>();
    for (const concept of concepts) {
        const current = rank.get(concept.topicId) ?? [Infinity, Infinity];
        const explicit = typeof concept.topicOrder === "number" ? concept.topicOrder : Infinity;
        rank.set(concept.topicId, [Math.min(current[0], explicit), Math.min(current[1], createdMillis(concept))]);
    }
    const value = (topicId: string, index: 0 | 1) => rank.get(topicId)?.[index] ?? Infinity;
    return (left, right) => diff(value(left, 0), value(right, 0)) || diff(value(left, 1), value(right, 1)) || left.localeCompare(right);
}

/** Lessons inside one chapter: sub-topic place, lesson place, creation time, tag. */
export function compareLessons(left: MicroConcept, right: MicroConcept): number {
    return diff(subTopicRank(left), subTopicRank(right))
        || diff(left.order, right.order)
        || diff(createdMillis(left), createdMillis(right))
        || left.microTag.localeCompare(right.microTag);
}

/** Every concept given, in curriculum order across classes. */
export function orderConcepts(concepts: MicroConcept[]): MicroConcept[] {
    const byClass = new Map<number, MicroConcept[]>();
    for (const concept of concepts) byClass.set(concept.classLevel, [...(byClass.get(concept.classLevel) ?? []), concept]);
    const ordered: MicroConcept[] = [];
    for (const classLevel of [...byClass.keys()].sort((left, right) => left - right)) {
        const inClass = byClass.get(classLevel)!;
        const chapter = compareChapters(inClass);
        ordered.push(...[...inClass].sort((left, right) => chapter(left.topicId, right.topicId) || compareLessons(left, right)));
    }
    return ordered;
}

/** True when the lesson's place was never confirmed against the textbook. */
export function sequenceUnconfirmed(concept: Pick<MicroConcept, "sequence">): boolean {
    return concept.sequence?.source === "unknown";
}

export interface SequencedLesson {
    microTag: string;
    title: string;
    subTopic: string | null;
    order: number;
    subTopicOrder: number | null;
    unconfirmed: boolean;
}

export interface SequencedChapter {
    topicId: string;
    title: string;
    topicOrder: number | null;
    subTopics: Array<{ name: string | null; lessons: SequencedLesson[] }>;
}

/** A class's taught content as chapters → sub-topics → lessons, in curriculum order. */
export function classOutline(concepts: MicroConcept[], classLevel: number): SequencedChapter[] {
    const taught = concepts.filter((concept) => concept.classLevel === classLevel && concept.status !== "archived" && !concept.foundationOnly);
    const chapters: SequencedChapter[] = [];
    for (const concept of orderConcepts(taught)) {
        let chapter = chapters.find((item) => item.topicId === concept.topicId);
        if (!chapter) {
            chapter = { topicId: concept.topicId, title: concept.topicTitle.english, topicOrder: typeof concept.topicOrder === "number" ? concept.topicOrder : null, subTopics: [] };
            chapters.push(chapter);
        }
        const name = concept.subTopic?.english?.trim() || null;
        let group = chapter.subTopics[chapter.subTopics.length - 1];
        if (!group || group.name !== name) {
            group = { name, lessons: [] };
            chapter.subTopics.push(group);
        }
        group.lessons.push({
            microTag: concept.microTag,
            title: concept.title.english,
            subTopic: name,
            order: concept.order,
            subTopicOrder: typeof concept.subTopicOrder === "number" ? concept.subTopicOrder : null,
            unconfirmed: sequenceUnconfirmed(concept),
        });
    }
    return chapters;
}

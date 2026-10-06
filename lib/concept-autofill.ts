import type { ConceptFamily, LocalizedText, MicroConcept } from "@/types/curriculum";

/**
 * Everything in the curriculum form that can be worked out from the class, topic and title,
 * so an admin only types the parts that need a person: the title and the summary.
 */

export function slugify(value: string, maxLength = 40): string {
    return value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, maxLength)
        .replace(/-+$/g, "");
}

function unique(base: string, taken: Set<string>): string {
    if (!taken.has(base)) return base;
    for (let index = 2; ; index += 1) {
        const candidate = `${base}-${index}`;
        if (!taken.has(candidate)) return candidate;
    }
}

/** e.g. Class 6 + "Prime Factorisation" -> "c6-prime-factorisation", made unique. */
export function suggestMicroTag(classLevel: number, titleEnglish: string, existingTags: Iterable<string>): string {
    const slug = slugify(titleEnglish);
    if (!slug) return "";
    return unique(`c${classLevel}-${slug}`, new Set(existingTags));
}

/** e.g. Class 7 + "Data Handling" -> "class7-data-handling", made unique. */
export function suggestTopicId(classLevel: number, topicEnglish: string, existingTopicIds: Iterable<string>): string {
    const slug = slugify(topicEnglish);
    if (!slug) return "";
    return unique(`class${classLevel}-${slug}`, new Set(existingTopicIds));
}

const VISUAL_BY_FAMILY: Record<ConceptFamily, MicroConcept["visualKind"]> = {
    foundation: "pattern",
    integer: "number-line",
    algebra: "expression",
    equation: "balance",
    ratio: "ratio",
};

export function visualForFamily(family: ConceptFamily): MicroConcept["visualKind"] {
    return VISUAL_BY_FAMILY[family];
}

/** Class 5 is always foundation; otherwise the topic name decides. */
export function familyForTopic(classLevel: number, topicEnglish: string): ConceptFamily {
    if (classLevel === 5) return "foundation";
    const name = topicEnglish.toLowerCase();
    if (/integer|negative|number line/.test(name)) return "integer";
    if (/equation/.test(name)) return "equation";
    if (/ratio|proportion|percent|rate/.test(name)) return "ratio";
    return "algebra";
}

export interface TopicOption {
    topicId: string;
    title: LocalizedText;
    family: ConceptFamily;
    visualKind: MicroConcept["visualKind"];
    /** The chapter's place in the class, when one was set. */
    topicOrder: number | null;
    /** The next free position in this topic. */
    nextOrder: number;
    /** The last concept in the topic, the natural prerequisite for a new one. */
    lastMicroTag: string | null;
    count: number;
}

const createdMillis = (concept: MicroConcept) => {
    const createdAt = (concept as { createdAt?: { toMillis?: () => number } | number }).createdAt;
    if (typeof createdAt === "number") return createdAt;
    return typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : Infinity;
};

/**
 * Chapters in teaching order: the chapter order the admin set, else the order the chapters were
 * created in, else the id. Within a chapter, lessons follow their own order.
 */
export function compareChapters(concepts: MicroConcept[]): (left: string, right: string) => number {
    const rank = new Map<string, [number, number]>();
    for (const concept of concepts) {
        const current = rank.get(concept.topicId) ?? [Infinity, Infinity];
        const explicit = typeof concept.topicOrder === "number" ? concept.topicOrder : Infinity;
        rank.set(concept.topicId, [Math.min(current[0], explicit), Math.min(current[1], createdMillis(concept))]);
    }
    const value = (topicId: string, index: 0 | 1) => rank.get(topicId)?.[index] ?? Infinity;
    const diff = (left: number, right: number) => (left === right ? 0 : left < right ? -1 : 1);
    return (left, right) => diff(value(left, 0), value(right, 0)) || diff(value(left, 1), value(right, 1)) || left.localeCompare(right);
}

/** The topics already used by a class, in teaching order, with what a new concept in each would inherit. */
export function topicsForClass(concepts: MicroConcept[], classLevel: number): TopicOption[] {
    const byTopic = new Map<string, MicroConcept[]>();
    for (const concept of concepts) {
        if (concept.classLevel !== classLevel) continue;
        byTopic.set(concept.topicId, [...(byTopic.get(concept.topicId) ?? []), concept]);
    }
    const compare = compareChapters(concepts.filter((concept) => concept.classLevel === classLevel));
    return [...byTopic.entries()].map(([topicId, items]) => {
        const ordered = [...items].sort((left, right) => left.order - right.order);
        const last = ordered[ordered.length - 1];
        const orders = ordered.map((item) => item.topicOrder).filter((value): value is number => typeof value === "number");
        return {
            topicId,
            title: last.topicTitle,
            family: last.family,
            visualKind: last.visualKind,
            topicOrder: orders.length ? Math.min(...orders) : null,
            nextOrder: Math.max(...ordered.map((item) => item.order)) + 1,
            lastMicroTag: last.microTag,
            count: ordered.length,
        };
    }).sort((left, right) => compare(left.topicId, right.topicId));
}

/** The place a brand-new chapter takes: after every chapter the class already has. */
export function nextTopicOrder(topics: TopicOption[]): number {
    const used = topics.map((topic) => topic.topicOrder).filter((value): value is number => typeof value === "number");
    return Math.max(topics.length, ...used.map((value) => value + 1));
}

/** Roman Urdu is optional for admins; an empty translation falls back to the English. */
export function withRomanFallback(value: LocalizedText): LocalizedText {
    return { english: value.english.trim(), romanUrdu: value.romanUrdu.trim() || value.english.trim() };
}

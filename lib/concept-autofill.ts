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
    /** The next free position in this topic. */
    nextOrder: number;
    /** The last concept in the topic, the natural prerequisite for a new one. */
    lastMicroTag: string | null;
    count: number;
}

/** The topics already used by a class, with what a new concept in each would inherit. */
export function topicsForClass(concepts: MicroConcept[], classLevel: number): TopicOption[] {
    const byTopic = new Map<string, MicroConcept[]>();
    for (const concept of concepts) {
        if (concept.classLevel !== classLevel) continue;
        byTopic.set(concept.topicId, [...(byTopic.get(concept.topicId) ?? []), concept]);
    }
    return [...byTopic.entries()].map(([topicId, items]) => {
        const ordered = [...items].sort((left, right) => left.order - right.order);
        const last = ordered[ordered.length - 1];
        return {
            topicId,
            title: last.topicTitle,
            family: last.family,
            visualKind: last.visualKind,
            nextOrder: Math.max(...ordered.map((item) => item.order)) + 1,
            lastMicroTag: last.microTag,
            count: ordered.length,
        };
    }).sort((left, right) => left.topicId.localeCompare(right.topicId));
}

/** Roman Urdu is optional for admins; an empty translation falls back to the English. */
export function withRomanFallback(value: LocalizedText): LocalizedText {
    return { english: value.english.trim(), romanUrdu: value.romanUrdu.trim() || value.english.trim() };
}

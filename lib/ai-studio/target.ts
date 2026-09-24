import { NEW_MICRO_TAG, type DraftTarget, type GenerationLevel } from "@/lib/ai-studio/types";
import type { MicroConcept, StudentClassLevel } from "@/types/curriculum";

export interface TargetInput {
    level: GenerationLevel;
    classLevel: StudentClassLevel;
    /** topicId of an existing chapter, or null with a title for a new one (micro-topics only). */
    chapter: { topicId: string | null; title: string };
    subTopic?: string | null;
    /** microTag of an existing micro-topic, or null with a title for a new one. */
    microTopic?: { microTag: string | null; title: string } | null;
    /** Sub-topic level: the micro-topics this checkpoint covers. */
    microTags?: string[];
}

const same = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase();

/** Live, taught concepts only: foundations are tested by the diagnostic and have no pools. */
const isTaught = (concept: MicroConcept) => concept.status !== "archived" && !concept.foundationOnly;

/** The chapter's live micro-topics, in teaching order. */
export function chapterConcepts(concepts: MicroConcept[], classLevel: number, topicId: string): MicroConcept[] {
    return concepts
        .filter((concept) => concept.classLevel === classLevel && concept.topicId === topicId && isTaught(concept))
        .sort((left, right) => left.order - right.order);
}

/**
 * Checks the Studio form against the curriculum and fixes what the questions may be filed
 * under. Sub-topic and main-topic pools only use micro-topics that already exist.
 */
export function buildTarget(input: TargetInput, concepts: MicroConcept[]): { target: DraftTarget } | { error: string } {
    const classConcepts = concepts.filter((concept) => concept.classLevel === input.classLevel && isTaught(concept));
    const chapterTitle = input.chapter.title.trim();
    let topicId = input.chapter.topicId;
    let title = chapterTitle;

    if (topicId) {
        const found = classConcepts.find((concept) => concept.topicId === topicId);
        if (!found) return { error: "That main topic does not exist for this class." };
        title = found.topicTitle.english;
    } else {
        if (input.level !== "micro") return { error: "Choose an existing main topic. Sub-topic and main-topic pools use micro-topics that already exist." };
        if (!chapterTitle) return { error: "Type the name of the new main topic." };
        const existing = classConcepts.find((concept) => same(concept.topicTitle.english, chapterTitle));
        if (existing) topicId = existing.topicId;
    }

    const inChapter = topicId ? chapterConcepts(concepts, input.classLevel, topicId) : [];
    const subTopic = input.subTopic?.trim() || null;
    const chapter = { topicId, title };

    if (input.level === "micro") {
        const chosen = input.microTopic;
        if (!chosen) return { error: "Choose a micro-topic or type a new one." };
        if (chosen.microTag) {
            const concept = inChapter.find((item) => item.microTag === chosen.microTag);
            if (!concept) return { error: "That micro-topic is not in this main topic." };
            return {
                target: {
                    classLevel: input.classLevel, chapter,
                    subTopic: subTopic ?? concept.subTopic?.english ?? null,
                    microTopic: { microTag: concept.microTag, title: concept.title.english },
                    microTopics: [{ microTag: concept.microTag, title: concept.title.english }],
                },
            };
        }
        const newTitle = chosen.title.trim();
        if (!newTitle) return { error: "Type the name of the new micro-topic." };
        const clash = inChapter.find((item) => same(item.title.english, newTitle));
        if (clash) return { error: `"${clash.title.english}" already exists in this main topic. Choose it from the list instead.` };
        return {
            target: {
                classLevel: input.classLevel, chapter, subTopic,
                microTopic: { microTag: null, title: newTitle },
                microTopics: [{ microTag: NEW_MICRO_TAG, title: newTitle }],
            },
        };
    }

    if (!inChapter.length) return { error: "This main topic has no micro-topics yet. Create micro-topics first." };

    if (input.level === "sub") {
        if (!subTopic) return { error: "Type the sub-topic name." };
        const tags = [...new Set(input.microTags ?? [])];
        if (!tags.length) return { error: "Tick the micro-topics this sub-topic covers." };
        const chosen = tags.map((tag) => inChapter.find((concept) => concept.microTag === tag));
        if (chosen.some((concept) => !concept)) return { error: "Some ticked micro-topics are not in this main topic." };
        return {
            target: {
                classLevel: input.classLevel, chapter, subTopic, microTopic: null,
                microTopics: (chosen as MicroConcept[]).map((concept) => ({ microTag: concept.microTag, title: concept.title.english })),
            },
        };
    }

    return {
        target: {
            classLevel: input.classLevel, chapter, subTopic: null, microTopic: null,
            microTopics: inChapter.map((concept) => ({ microTag: concept.microTag, title: concept.title.english })),
        },
    };
}

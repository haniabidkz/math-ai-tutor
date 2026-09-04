import type { LocalizedText } from "@/types/curriculum";
import type { DiagnosticProfile } from "@/types/assessment";
import type { TopicBand } from "@/lib/diagnostic-blueprint";

export interface RecommendableConcept {
    microTag: string;
    title: LocalizedText;
    topicTitle: LocalizedText;
    topicId: string;
    order: number;
    mastered: boolean;
    locked: boolean;
    percentage: number;
}

export interface OpenMisconception {
    microTag: string;
    misconceptionTag: string;
    count: number;
}

export type RecommendationReason =
    | "misconception"
    | "diagnostic-weak-topic"
    | "diagnostic-recommendation"
    | "next-in-path"
    | "all-mastered";

export interface Recommendation {
    concept: RecommendableConcept | null;
    reason: RecommendationReason;
}

const BAND_RANK: Record<TopicBand, number> = { "very-weak": 0, weak: 1, "needs-practice": 2, strong: 3 };

/**
 * Chooses the next lesson from everything the system knows about the learner:
 * open misconceptions first, then weak diagnostic areas, then the ordered path.
 */
export function recommendNextLesson(input: {
    concepts: RecommendableConcept[];
    diagnosticProfile?: Pick<DiagnosticProfile, "topicResults" | "recommendedMicroTag" | "weakMicroTags"> | null;
    misconceptions?: OpenMisconception[];
}): Recommendation {
    const available = input.concepts.filter((concept) => !concept.mastered && !concept.locked);
    if (!available.length) return { concept: null, reason: "all-mastered" };

    // 1) A concept the student keeps getting wrong in the same way.
    const ranked = [...(input.misconceptions ?? [])].sort((left, right) => right.count - left.count);
    for (const misconception of ranked) {
        const match = available.find((concept) => concept.microTag === misconception.microTag);
        if (match) return { concept: match, reason: "misconception" };
    }

    // 2) The weakest diagnostic area that still has work left in it.
    const topics = [...(input.diagnosticProfile?.topicResults ?? [])]
        .sort((left, right) => BAND_RANK[left.band] - BAND_RANK[right.band]);
    for (const topic of topics) {
        if (topic.band === "strong") break;
        const match = available.find((concept) => topic.microTags.includes(concept.microTag));
        if (match) return { concept: match, reason: "diagnostic-weak-topic" };
    }

    // 3) Whatever the diagnostic originally recommended.
    const recommended = available.find((concept) => concept.microTag === input.diagnosticProfile?.recommendedMicroTag);
    if (recommended) return { concept: recommended, reason: "diagnostic-recommendation" };

    // 4) Otherwise simply continue along the ordered path.
    return { concept: available[0], reason: "next-in-path" };
}

export type LearningStatus = "getting-started" | "on-track" | "needs-practice" | "needs-support";

export const LEARNING_STATUS_LABELS: Record<LearningStatus, LocalizedText> = {
    "getting-started": { english: "Getting started", romanUrdu: "Shuruaat ho rahi hai" },
    "on-track": { english: "On track", romanUrdu: "Sahi raah par" },
    "needs-practice": { english: "Needs practice", romanUrdu: "Mashq darkar" },
    "needs-support": { english: "Needs support", romanUrdu: "Madad darkar" },
};

/** A single headline describing how the learner is doing overall. */
export function learningStatus(input: {
    masteredCount: number;
    totalCount: number;
    openMisconceptions: number;
    quizzesCompleted: number;
    diagnosticOverallBand?: "strong" | "needs-practice" | "weak" | null;
}): LearningStatus {
    if (input.quizzesCompleted === 0 && input.masteredCount === 0) return "getting-started";
    if (input.openMisconceptions >= 2 || input.diagnosticOverallBand === "weak") return "needs-support";

    const masteredRatio = input.totalCount ? input.masteredCount / input.totalCount : 0;
    if (masteredRatio >= 0.7) return "on-track";
    if (input.openMisconceptions >= 1 || masteredRatio < 0.3) return "needs-practice";
    return "on-track";
}

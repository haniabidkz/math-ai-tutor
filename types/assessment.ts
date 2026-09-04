import type { OverallBand, TopicBand } from "@/lib/diagnostic-blueprint";
import type { Difficulty, LocalizedText, StudentClassLevel, SupportedClassLevel } from "./curriculum";

export type AssessmentKind = "diagnostic" | "mastery" | "weekly";
export type AssessmentSessionStatus =
    | "created"
    | "active"
    | "remedial_required"
    | "misconception_practice"
    | "completed";

export interface AssessmentAnswerEvent {
    eventId: string;
    questionId: string;
    optionId: string;
    isCorrect: boolean;
    scoreDelta: number;
    difficulty: Difficulty;
    microTag: string;
    createdAt: Date;
}

/** One of the five diagnostic areas, scored out of three. */
export interface DiagnosticTopicResult {
    topicKey: string;
    title: LocalizedText;
    microTags: string[];
    correct: number;
    total: number;
    band: TopicBand;
}

export interface DiagnosticProfile {
    assessedClassLevel: StudentClassLevel;
    mathLevel: SupportedClassLevel;
    baselineDifficulty: Difficulty;
    topicResults: DiagnosticTopicResult[];
    overallCorrect: number;
    overallTotal: number;
    overallBand: OverallBand;
    strongMicroTags: string[];
    weakMicroTags: string[];
    weakMicroTag: string | null;
    weakTopic: LocalizedText | null;
    recommendedMicroTag: string;
    recommendedTopic: LocalizedText;
    accuracyPercent: number;
}

export interface RemedialPayload {
    microTag: string;
    prerequisiteTag: string;
    title: LocalizedText;
    concept: LocalizedText;
    visualKind: string;
    imageUrl?: string;
}

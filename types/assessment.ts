import type { Difficulty, LocalizedText, StudentClassLevel, SupportedClassLevel } from "./curriculum";

export type AssessmentKind = "diagnostic" | "mastery" | "weekly";
export type AssessmentSessionStatus =
    | "created"
    | "active"
    | "remedial_required"
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

export interface DiagnosticProfile {
    assessedClassLevel: StudentClassLevel;
    mathLevel: SupportedClassLevel;
    baselineDifficulty: Difficulty;
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

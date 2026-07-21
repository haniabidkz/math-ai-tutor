import type { Difficulty, LocalizedText, StudentClassLevel } from "./curriculum";

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
    baselineDifficulty: Difficulty;
    strongMicroTags: string[];
    weakMicroTags: string[];
    recommendedMicroTag: string;
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

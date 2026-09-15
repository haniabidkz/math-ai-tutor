import type { Difficulty, LocalizedOption, LocalizedText, MisconceptionTag, StudentClassLevel } from "@/types/curriculum";

/** Micro-topic (30), sub-topic checkpoint (45) or main-topic mastery pool (60). */
export type GenerationLevel = "micro" | "sub" | "main";

export const CURRICULUM_NAME = "Oxford Countdown";

/** Placeholder tag for questions of a micro-topic that is created only on approval. */
export const NEW_MICRO_TAG = "__new_micro_topic__";

export type OptionLetter = LocalizedOption["id"];
export const OPTION_LETTERS: OptionLetter[] = ["A", "B", "C", "D"];

export interface Quota {
    easy: number;
    medium: number;
    hard: number;
}

export interface DraftWrongReason {
    english: string;
    romanUrdu: string;
    misconceptionTag: MisconceptionTag;
}

export type VerificationStatus = "pending" | "agrees" | "disagrees" | "confirmed" | "error";

export interface DraftQuestion {
    key: string;
    difficulty: Difficulty;
    /** The micro-topic this question is filed under once it goes live. */
    microTag: string;
    questionText: string;
    options: string[];
    correctOption: OptionLetter;
    hint: LocalizedText;
    solution: LocalizedText;
    /** One reason per wrong option; the correct option has none. */
    wrongReasons: Partial<Record<OptionLetter, DraftWrongReason>>;
    verification: {
        status: VerificationStatus;
        /** The answer a second, independent solve arrived at. */
        aiAnswer?: OptionLetter | null;
        note?: string;
        /** Fingerprint of the question when it was checked, so edits reset the check. */
        fingerprint?: string;
    };
    origin: "ai" | "manual";
}

export interface DraftConcept {
    title: string;
    example: LocalizedText;
    explanation: LocalizedText;
}

export interface DraftTarget {
    classLevel: StudentClassLevel;
    /** Main topic. A null topicId means a new chapter, allowed for micro-topics only. */
    chapter: { topicId: string | null; title: string };
    subTopic: string | null;
    /** Micro-topic being written. A null microTag means it is created on approval. */
    microTopic: { microTag: string | null; title: string } | null;
    /** Micro-topics the questions may be filed under, with titles for the model. */
    microTopics: Array<{ microTag: string; title: string }>;
}

export type StepStatus = "pending" | "running" | "done" | "failed";

export interface GenerationStep {
    id: string;
    kind: "concept" | "questions";
    difficulty?: Difficulty;
    count?: number;
    status: StepStatus;
    attempts: number;
    error?: string;
    /** Why the last reply was rejected; sent back to the model on the next attempt. */
    feedback?: string[];
    startedAt?: number;
}

export type DraftStatus = "generating" | "needs_review" | "approved" | "discarded";

export interface GenerationDraft {
    id: string;
    status: DraftStatus;
    level: GenerationLevel;
    curriculum: string;
    target: DraftTarget;
    quota: Quota;
    concept: DraftConcept | null;
    questions: DraftQuestion[];
    steps: GenerationStep[];
    usage: { calls: number; inputTokens: number; outputTokens: number };
    createdBy: string;
    createdByEmail: string;
    createdAt?: unknown;
    updatedAt?: unknown;
    approvedAt?: unknown;
    publishedMicroTag?: string | null;
    publishedQuestionIds?: string[];
}

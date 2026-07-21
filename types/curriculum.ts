export type SupportedClassLevel = 5 | 6 | 7 | 8;
export type StudentClassLevel = 6 | 7 | 8;
export type Difficulty = "easy" | "medium" | "hard";
export type Locale = "english" | "roman-urdu";
export type ContentStatus = "draft" | "published" | "archived";

export interface LocalizedText {
    english: string;
    romanUrdu: string;
}

export type ConceptFamily =
    | "foundation"
    | "integer"
    | "algebra"
    | "equation"
    | "ratio";

export interface MicroConcept {
    microTag: string;
    prerequisiteTag: string | null;
    classLevel: SupportedClassLevel;
    topicId: string;
    topicTitle: LocalizedText;
    title: LocalizedText;
    concept: LocalizedText;
    family: ConceptFamily;
    visualKind: "number-line" | "fraction" | "expression" | "balance" | "ratio" | "pattern";
    imageUrl?: string;
    order: number;
    foundationOnly?: boolean;
    status: ContentStatus;
}

export interface LocalizedOption {
    id: "A" | "B" | "C" | "D";
    english: string;
    romanUrdu: string;
}

export interface QuestionBankItem {
    id: string;
    microTag: string;
    prerequisiteTag: string | null;
    classLevel: SupportedClassLevel;
    difficulty: Difficulty;
    question: LocalizedText;
    options: LocalizedOption[];
    correctOptionId: LocalizedOption["id"];
    hint: LocalizedText;
    explanation: LocalizedText;
    source: "sindh" | "oxford";
    status: ContentStatus;
    version: number;
}

export interface AssessmentConfig {
    diagnosticQuestionCount: number;
    masteryQuestionCount: number;
    weeklyQuestionCount: number;
    weeklyIntervalDays: number;
    masteryThresholdPercent: number;
    scoreCorrect: number;
    scoreHint: number;
    scoreIncorrect: number;
}

export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
    diagnosticQuestionCount: 24,
    masteryQuestionCount: 10,
    weeklyQuestionCount: 8,
    weeklyIntervalDays: 7,
    masteryThresholdPercent: 70,
    scoreCorrect: 1,
    scoreHint: -0.5,
    scoreIncorrect: -1,
};

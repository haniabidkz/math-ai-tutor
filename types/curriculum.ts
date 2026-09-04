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

/** Error families used to classify wrong options and detect repeated misconceptions. */
export type MistakeType =
    | "sign-error"
    | "operation-confusion"
    | "inverse-operation"
    | "coefficient-misread"
    | "ratio-order"
    | "partial-step"
    | "off-by-one"
    | "computation";

export interface OptionAnalysis {
    mistakeType: MistakeType;
    explanation: LocalizedText;
}

export type QuestionOptionAnalysis = Partial<Record<LocalizedOption["id"], OptionAnalysis>>;

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
    /** Per-distractor mistake type and explanation; derived at runtime when absent. */
    optionAnalysis?: QuestionOptionAnalysis;
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
    /** Repeats of one mistake type on one concept before it counts as a misconception. */
    misconceptionThreshold: number;
    /** Targeted practice questions served before the re-check question. */
    misconceptionPracticeCount: number;
}

export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
    diagnosticQuestionCount: 15,
    masteryQuestionCount: 10,
    weeklyQuestionCount: 8,
    weeklyIntervalDays: 7,
    masteryThresholdPercent: 70,
    scoreCorrect: 1,
    scoreHint: -0.5,
    scoreIncorrect: -1,
    misconceptionThreshold: 3,
    misconceptionPracticeCount: 2,
};

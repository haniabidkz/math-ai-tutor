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
    /** A local real-life example shown with the lesson. */
    example?: LocalizedText;
    /** Optional grouping between the chapter (topic) and the micro-concept. */
    subTopic?: LocalizedText;
    order: number;
    /** The chapter's place in its class; lessons unlock chapter by chapter in this order. */
    topicOrder?: number;
    /** The sub-topic's place inside its chapter; lessons of one sub-topic share it. */
    subTopicOrder?: number;
    /** How the lesson's place in the textbook order was decided, and whether it still needs confirming. */
    sequence?: { source: "ai" | "manual" | "unknown"; textbook?: string; note?: string; updatedAt?: unknown };
    /** The AI Studio's picture for the lesson, or its decision that a picture would not help. */
    visual?: LessonVisual | null;
    /** One solved example, step by step, with the reason for each step. */
    workedExample?: WorkedExample | null;
    foundationOnly?: boolean;
    status: ContentStatus;
}

/** The simple drawings a lesson can show; each is drawn by the app from a few numbers or words. */
export type LessonVisualSpec =
    | { type: "number_line"; min: number; max: number; step: number; points: Array<{ value: number; label?: string }>; jumps: Array<{ from: number; to: number; label?: string }> }
    | { type: "fraction_model"; shape: "bar" | "circle"; numerator: number; denominator: number }
    | { type: "area_model"; rows: number; cols: number; shaded: number; rowLabel?: string; colLabel?: string }
    | { type: "balance_scale"; left: string[]; right: string[]; balanced: boolean }
    | { type: "venn_diagram"; universal: { label: string; elements: string[] } | null; sets: Array<{ label: string; elements: string[] }> }
    | { type: "set_roster"; name: string; elements: string[] }
    | { type: "geometry_shape"; shape: "triangle" | "right_triangle" | "rectangle" | "square" | "circle" | "parallelogram"; sideLabels: string[]; angleLabels: string[] }
    | { type: "bar_model"; bars: Array<{ label: string; value: number }>; unit: string };

export type LessonVisualType = LessonVisualSpec["type"];

/** A picture only when it really helps: `required: false` records that the AI decided against one. */
export interface LessonVisual {
    required: boolean;
    caption: LocalizedText;
    spec: LessonVisualSpec | null;
}

export interface WorkedExampleStep {
    /** What is done in this step. */
    text: LocalizedText;
    /** Why this step is done. */
    why: LocalizedText;
}

export interface WorkedExample {
    problem: LocalizedText;
    steps: WorkedExampleStep[];
    finalAnswer: LocalizedText;
    /** An independent solve of the problem by a second model, when the lesson was generated. */
    check?: { status: "agrees" | "error"; note?: string };
}

export interface LocalizedOption {
    id: "A" | "B" | "C" | "D";
    english: string;
    romanUrdu: string;
}

/** Broad error family a wrong option belongs to. */
export type MistakeType = "concept" | "calculation" | "sign" | "operation" | "carelessness";

/** The specific underlying misunderstanding; repeats of one tag become a misconception. */
export type MisconceptionTag =
    | "sign-direction"
    | "wrong-operation-choice"
    | "incomplete-inverse-operation"
    | "coefficient-vs-constant"
    | "ratio-order-reversed"
    | "stopped-before-final-step"
    | "off-by-one-count"
    | "arithmetic-slip";

export interface OptionAnalysis {
    mistakeType: MistakeType;
    misconceptionTag: MisconceptionTag;
    /** Very simple explanation of why this option is wrong. */
    whyWrong: LocalizedText;
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
    /** Empty for sub-topic and main-topic pool questions, which give no hint. */
    hint: LocalizedText;
    /** Empty for sub-topic and main-topic pool questions, which give no worked solution. */
    explanation: LocalizedText;
    /** Per-distractor mistake type and explanation; derived at runtime when absent (micro-topic questions only). */
    optionAnalysis?: QuestionOptionAnalysis;
    /** The pool the question was written for; micro-topic questions explain themselves, the others only mark. */
    level?: "micro" | "sub" | "main";
    source: "sindh" | "oxford";
    status: ContentStatus;
    version: number;
    /** Diagnostic test questions are served only by the diagnostic, never in quizzes. */
    purpose?: "diagnostic";
    /** For diagnostic questions: the class whose entry test this question belongs to. */
    diagnosticFor?: StudentClassLevel;
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
    /** AI Studio: exact questions per difficulty for each generation level. */
    quotaMicroEasy: number;
    quotaMicroMedium: number;
    quotaMicroHard: number;
    quotaSubEasy: number;
    quotaSubMedium: number;
    quotaSubHard: number;
    quotaMainEasy: number;
    quotaMainMedium: number;
    quotaMainHard: number;
}

export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
    diagnosticQuestionCount: 15,
    masteryQuestionCount: 10,
    weeklyQuestionCount: 8,
    weeklyIntervalDays: 7,
    masteryThresholdPercent: 70,
    scoreCorrect: 1,
    scoreHint: 0,
    scoreIncorrect: 0,
    misconceptionThreshold: 3,
    misconceptionPracticeCount: 2,
    quotaMicroEasy: 10,
    quotaMicroMedium: 10,
    quotaMicroHard: 10,
    quotaSubEasy: 15,
    quotaSubMedium: 20,
    quotaSubHard: 10,
    quotaMainEasy: 20,
    quotaMainMedium: 20,
    quotaMainHard: 20,
};

import type { LocalizedText, StudentClassLevel } from "@/types/curriculum";

const text = (english: string, romanUrdu: string): LocalizedText => ({ english, romanUrdu });

export const DIAGNOSTIC_TOPIC_COUNT = 5;
export const DIAGNOSTIC_QUESTIONS_PER_TOPIC = 3;
export const DIAGNOSTIC_QUESTION_COUNT = DIAGNOSTIC_TOPIC_COUNT * DIAGNOSTIC_QUESTIONS_PER_TOPIC;

/** Stored on every diagnostic session; sessions started under the old blueprint are restarted. */
export const DIAGNOSTIC_VERSION = 2;

export interface DiagnosticTopic {
    topicKey: string;
    title: LocalizedText;
    /** The previous-class foundation concept all three questions of this topic test. */
    microTag: string;
    /** Enrolled-class lessons that build on this topic, recommended when it is weak. */
    lessonTags: string[];
    /** The easy, medium and hard question, in that order. */
    questionIds: string[];
}

/** "diag-c6-01" … "diag-c6-15": fixed ids, so the Super Admin can edit each question. */
export function diagnosticQuestionId(classLevel: StudentClassLevel, index: number): string {
    return `diag-c${classLevel}-${String(index + 1).padStart(2, "0")}`;
}

type TopicSeed = Omit<DiagnosticTopic, "questionIds">;

/**
 * Each class's entry test checks the previous class: five topics, each with one easy, one
 * medium and one hard question from the owner's fixed question set (lib/diagnostic-questions.ts).
 */
const TOPICS: Record<StudentClassLevel, TopicSeed[]> = {
    6: [
        { topicKey: "whole-numbers", title: text("Whole Numbers & Basic Operations", "Pooray numbers aur bunyadi amal"), microTag: "c5-whole-number-operations", lessonTags: ["c6-integers-intro"] },
        { topicKey: "fractions", title: text("Fractions", "Kasr"), microTag: "c5-fractions", lessonTags: [] },
        { topicKey: "decimals", title: text("Decimals", "Ashariya"), microTag: "c5-decimals", lessonTags: [] },
        { topicKey: "factors-multiples", title: text("Factors & Multiples", "Factors aur multiples"), microTag: "c5-factors-multiples", lessonTags: [] },
        { topicKey: "geometry", title: text("Basic Geometry", "Bunyadi geometry"), microTag: "c5-basic-geometry", lessonTags: [] },
    ],
    7: [
        { topicKey: "whole-numbers", title: text("Whole Numbers & Operations", "Pooray numbers aur un ke amal"), microTag: "c6-whole-number-operations", lessonTags: ["c7-one-step-equations"] },
        { topicKey: "fractions", title: text("Fractions", "Kasr"), microTag: "c6-fractions", lessonTags: [] },
        { topicKey: "decimals", title: text("Decimals", "Ashariya"), microTag: "c6-decimals", lessonTags: [] },
        { topicKey: "factors-multiples", title: text("Factors & Multiples", "Factors aur multiples"), microTag: "c6-factors-multiples", lessonTags: [] },
        { topicKey: "geometry", title: text("Basic Geometry", "Bunyadi geometry"), microTag: "c6-basic-geometry", lessonTags: [] },
    ],
    8: [
        { topicKey: "integers", title: text("Integers & Operations", "Integers aur un ke amal"), microTag: "c7-integer-operations", lessonTags: ["c8-equation-revision"] },
        { topicKey: "fractions", title: text("Fractions & Rational Numbers", "Kasr aur rational numbers"), microTag: "c7-rational-numbers", lessonTags: ["c8-equivalent-ratios"] },
        { topicKey: "decimals-percentages", title: text("Decimals & Percentages", "Ashariya aur feesad"), microTag: "c7-decimals-percentages", lessonTags: ["c8-direct-proportion"] },
        { topicKey: "ratio-financial", title: text("Ratio, Proportion & Financial Arithmetic", "Nisbat, tanasub aur maali hisaab"), microTag: "c7-ratio-financial", lessonTags: ["c8-ratio-basics"] },
        { topicKey: "algebra-equations", title: text("Algebra & Linear Equations", "Algebra aur linear equations"), microTag: "c7-algebra-equations", lessonTags: ["c8-equation-revision"] },
    ],
};

export function getDiagnosticBlueprint(classLevel: StudentClassLevel): DiagnosticTopic[] {
    return TOPICS[classLevel].map((topic, topicIndex) => ({
        ...topic,
        lessonTags: [...topic.lessonTags],
        questionIds: Array.from({ length: DIAGNOSTIC_QUESTIONS_PER_TOPIC }, (_, position) =>
            diagnosticQuestionId(classLevel, topicIndex * DIAGNOSTIC_QUESTIONS_PER_TOPIC + position)),
    }));
}

/** The 15 question ids in the order they are asked. */
export function getDiagnosticQuestionIds(classLevel: StudentClassLevel): string[] {
    return getDiagnosticBlueprint(classLevel).flatMap((topic) => topic.questionIds);
}

export function getDiagnosticTopicFor(classLevel: StudentClassLevel, questionIndex: number): DiagnosticTopic {
    return getDiagnosticBlueprint(classLevel)[Math.floor(questionIndex / DIAGNOSTIC_QUESTIONS_PER_TOPIC)];
}

export type TopicBand = "strong" | "needs-practice" | "weak" | "very-weak";
export type OverallBand = "strong" | "needs-practice" | "weak";

/** 3/3 strong, 2/3 needs practice, 1/3 weak, 0/3 very weak. */
export function topicBand(correct: number): TopicBand {
    if (correct >= 3) return "strong";
    if (correct === 2) return "needs-practice";
    if (correct === 1) return "weak";
    return "very-weak";
}

/** 12-15 strong, 8-11 needs practice, 0-7 weak. */
export function overallBand(correct: number): OverallBand {
    if (correct >= 12) return "strong";
    if (correct >= 8) return "needs-practice";
    return "weak";
}

export const TOPIC_BAND_LABELS: Record<TopicBand, LocalizedText> = {
    strong: text("Strong", "Mazboot"),
    "needs-practice": text("Needs Practice", "Mashq darkar"),
    weak: text("Weak", "Kamzor"),
    "very-weak": text("Very Weak", "Bohat kamzor"),
};

export const OVERALL_BAND_LABELS: Record<OverallBand, LocalizedText> = {
    strong: text("Strong", "Mazboot"),
    "needs-practice": text("Needs Practice", "Mashq darkar"),
    weak: text("Weak", "Kamzor"),
};

import { getConcept } from "@/lib/curriculum";
import type { LocalizedText, MicroConcept, StudentClassLevel } from "@/types/curriculum";

const text = (english: string, romanUrdu: string): LocalizedText => ({ english, romanUrdu });

export const DIAGNOSTIC_TOPIC_COUNT = 5;
export const DIAGNOSTIC_QUESTIONS_PER_TOPIC = 3;
export const DIAGNOSTIC_QUESTION_COUNT = DIAGNOSTIC_TOPIC_COUNT * DIAGNOSTIC_QUESTIONS_PER_TOPIC;

export interface DiagnosticTopic {
    topicKey: string;
    title: LocalizedText;
    /** Exactly three concepts, one per question. */
    microTags: string[];
}

/**
 * The diagnostic is a fixed blueprint of five areas with three questions each, mixing the
 * previous class (foundations) with the entry concepts of the enrolled class.
 */
const BLUEPRINTS: Record<StudentClassLevel, DiagnosticTopic[]> = {
    6: [
        { topicKey: "number-foundations", title: text("Number Foundations", "Number ki bunyaad"), microTags: ["c5-whole-number-operations", "c5-factors-multiples", "c5-number-line"] },
        { topicKey: "fractions-decimals", title: text("Fractions and Decimals", "Kasr aur ashariya"), microTags: ["c5-fractions", "c5-decimals", "c5-ratios"] },
        { topicKey: "integers", title: text("Integers", "Integers"), microTags: ["c6-integers-intro", "c6-positive-numbers", "c6-negative-numbers"] },
        { topicKey: "integer-operations", title: text("Integer Operations", "Integers ke amal"), microTags: ["c6-number-line", "c6-integer-comparisons", "c6-integer-addition"] },
        { topicKey: "algebra-basics", title: text("Algebra Basics", "Algebra ki bunyaad"), microTags: ["c6-variable-foundations", "c6-constants", "c6-algebraic-expressions"] },
    ],
    7: [
        { topicKey: "integers", title: text("Integers", "Integers"), microTags: ["c6-integers-intro", "c6-integer-addition", "c6-integer-subtraction"] },
        { topicKey: "algebra-foundations", title: text("Algebra Foundations", "Algebra ki bunyaad"), microTags: ["c6-variable-foundations", "c6-constants", "c6-simple-terms"] },
        { topicKey: "expressions", title: text("Expressions", "Expressions"), microTags: ["c6-algebraic-expressions", "c6-like-unlike-terms", "c6-evaluating-expressions"] },
        { topicKey: "terms-coefficients", title: text("Terms and Coefficients", "Terms aur coefficients"), microTags: ["c7-variable-constant-isolation", "c7-term-segmentation", "c7-coefficients"] },
        { topicKey: "equations", title: text("Equations", "Equations"), microTags: ["c7-equation-structure", "c7-equation-variables", "c7-one-step-equations"] },
    ],
    8: [
        { topicKey: "expressions", title: text("Expressions", "Expressions"), microTags: ["c7-variable-constant-isolation", "c7-term-segmentation", "c7-coefficients"] },
        { topicKey: "simplification", title: text("Simplification", "Sada karna"), microTags: ["c7-grouping-terms", "c7-linear-simplification", "c7-complex-expressions"] },
        { topicKey: "linear-equations", title: text("Linear Equations", "Linear equations"), microTags: ["c7-one-step-equations", "c7-two-step-equations", "c7-equation-verification"] },
        { topicKey: "equation-systems", title: text("Equation Systems", "Equation systems"), microTags: ["c8-equation-revision", "c8-one-two-step-systems", "c8-multi-step-equations"] },
        { topicKey: "ratio-proportion", title: text("Ratio and Proportion", "Nisbat aur proportion"), microTags: ["c8-ratio-basics", "c8-equivalent-ratios", "c8-proportion-basics"] },
    ],
};

export function getDiagnosticBlueprint(classLevel: StudentClassLevel): DiagnosticTopic[] {
    return BLUEPRINTS[classLevel];
}

/** Flattens the blueprint into the 15 concepts served, in order. */
export function getDiagnosticConceptOrder(classLevel: StudentClassLevel): MicroConcept[] {
    return getDiagnosticBlueprint(classLevel).flatMap((topic) =>
        topic.microTags.map((microTag) => {
            const concept = getConcept(microTag);
            if (!concept) throw new Error(`Diagnostic blueprint references unknown concept ${microTag}`);
            return concept;
        }));
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

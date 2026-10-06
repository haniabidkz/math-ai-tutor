import type { LocalizedText, MicroConcept, QuestionBankItem, SupportedClassLevel } from "@/types/curriculum";

/**
 * Previous-class fallback. A student who struggles with a lesson of their own class practises
 * the same topic from the class before, then returns to the lesson. The enrolled class never
 * changes: the round only borrows questions, scores nothing, and the student's progress stays
 * on their own lesson. With no same-topic lesson in the previous class, the normal adaptive
 * flow simply continues; unrelated lower-class questions are never used.
 */

export interface FoundationSource {
    /** The previous-class lessons the round draws questions from. */
    microTags: string[];
    title: LocalizedText;
    topicTitle: LocalizedText;
    classLevel: SupportedClassLevel;
    /** Matched on the lesson's own title, or on its chapter's title. */
    matchedBy: "lesson" | "chapter";
}

export interface FoundationRound {
    queue: QuestionBankItem[];
    /** Position in the queue; rounds are consecutive slices of it. */
    index: number;
    roundSize: number;
    /** Correct answers a round needs before the quiz resumes. */
    passMark: number;
    round: number;
    maxRounds: number;
    /** Correct answers in the current round. */
    correct: number;
    /** Set once the quiz resumes. */
    outcome?: "passed" | "not_passed";
}

/** What the quiz screen shows during and after a round. */
export interface FoundationProgress {
    title: LocalizedText;
    topicTitle: LocalizedText;
    classLevel: SupportedClassLevel;
    number: number;
    total: number;
    round: number;
    maxRounds: number;
    passMark: number;
    correct: number;
    outcome?: "passed" | "not_passed";
}

/** Questions per round, and the most rounds before the quiz resumes regardless. */
export const FOUNDATION_ROUND_SIZE = 4;
export const FOUNDATION_MAX_ROUNDS = 2;
/** Fewer questions than this cannot show improvement, so no round is offered. */
export const FOUNDATION_MIN_QUESTIONS = 3;

/** "Fractions & Decimals" and "fractions and decimals" are the same topic. */
export const normalizeTitle = (value: string) => value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The same topic one class down: first a lesson with the same title, otherwise the lessons of
 * a chapter with the same title. Diagnostic-only foundations are tested, not practised.
 */
export function findPreviousClassTopic(concept: Pick<MicroConcept, "classLevel" | "title" | "topicTitle">, concepts: MicroConcept[]): FoundationSource | null {
    const previous = (concept.classLevel - 1) as SupportedClassLevel;
    const candidates = concepts
        .filter((item) => item.classLevel === previous && item.status !== "archived" && !item.foundationOnly)
        .sort((left, right) => left.topicId.localeCompare(right.topicId) || left.order - right.order);
    const sameLesson = candidates.filter((item) => normalizeTitle(item.title.english) === normalizeTitle(concept.title.english));
    if (sameLesson.length) {
        return { microTags: sameLesson.map((item) => item.microTag), title: sameLesson[0].title, topicTitle: sameLesson[0].topicTitle, classLevel: previous, matchedBy: "lesson" };
    }
    const sameChapter = candidates.filter((item) => normalizeTitle(item.topicTitle.english) === normalizeTitle(concept.topicTitle.english));
    if (sameChapter.length) {
        return { microTags: sameChapter.map((item) => item.microTag), title: sameChapter[0].topicTitle, topicTitle: sameChapter[0].topicTitle, classLevel: previous, matchedBy: "chapter" };
    }
    return null;
}

/**
 * Struggling means two wrong answers on the lesson's own questions in this quiz, or one when
 * an earlier quiz on the lesson already fell short of mastery. One round per quiz.
 */
export function shouldOfferFoundation(input: { wrongMainAnswers: number; struggledBefore: boolean; alreadyOffered: boolean }): boolean {
    if (input.alreadyOffered) return false;
    return input.wrongMainAnswers >= 2 || (input.struggledBefore && input.wrongMainAnswers >= 1);
}

/** The rounds a pool of previous-class questions allows, or null when the pool is too small. */
export function planFoundationRound(questions: QuestionBankItem[], masteryThresholdPercent: number): FoundationRound | null {
    if (questions.length < FOUNDATION_MIN_QUESTIONS) return null;
    const roundSize = Math.min(FOUNDATION_ROUND_SIZE, questions.length);
    const maxRounds = Math.min(FOUNDATION_MAX_ROUNDS, Math.max(1, Math.floor(questions.length / roundSize)));
    // The usual mastery threshold, applied to the round: 70% of 4 questions is 3 right. A round
    // of four or more never demands a perfect score, so an 80% threshold also means 3 of 4.
    const byThreshold = Math.ceil((masteryThresholdPercent / 100) * roundSize);
    const passMark = Math.max(1, roundSize >= 4 ? Math.min(byThreshold, roundSize - 1) : byThreshold);
    return { queue: questions.slice(0, roundSize * maxRounds), index: 0, roundSize, passMark, round: 1, maxRounds, correct: 0 };
}

/**
 * Records one answer of the round. A passed round resumes the quiz; a failed one starts the
 * next round while there is one, and resumes the quiz after the last.
 */
export function advanceFoundationRound(round: FoundationRound, correct: boolean): { round: FoundationRound; resume: boolean } {
    const index = round.index + 1;
    const correctCount = round.correct + (correct ? 1 : 0);
    const roundFinished = index % round.roundSize === 0 || index >= round.queue.length;
    if (!roundFinished) return { round: { ...round, index, correct: correctCount }, resume: false };
    const passed = correctCount >= round.passMark;
    const another = !passed && round.round < round.maxRounds && index < round.queue.length;
    if (another) return { round: { ...round, index, correct: 0, round: round.round + 1 }, resume: false };
    return { round: { ...round, index, correct: correctCount, outcome: passed ? "passed" : "not_passed" }, resume: true };
}

export function foundationProgress(source: FoundationSource, round: FoundationRound): FoundationProgress {
    return {
        title: source.title,
        topicTitle: source.topicTitle,
        classLevel: source.classLevel,
        number: (round.index % round.roundSize) + 1,
        total: round.roundSize,
        round: round.round,
        maxRounds: round.maxRounds,
        passMark: round.passMark,
        correct: round.correct,
        outcome: round.outcome,
    };
}

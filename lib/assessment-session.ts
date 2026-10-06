import type { Difficulty, Locale, MicroConcept, MisconceptionTag, MistakeType, QuestionBankItem } from "@/types/curriculum";
import { MICRO_CONCEPTS, isLearningConceptForClass } from "@/lib/curriculum";
import type { FoundationRound, FoundationSource } from "@/lib/foundation-fallback";
import { XP_FIRST_ATTEMPT_CORRECT, XP_QUIZ_COMPLETED } from "@/lib/gamification";
import type { TimestampLike } from "@/lib/learner-metrics";
import { getDiagnosticBlueprint, overallBand, topicBand, type TopicBand } from "@/lib/diagnostic-blueprint";
import type { DiagnosticProfile, DiagnosticTopicResult } from "@/types/assessment";

export interface StoredAnswer {
    eventId: string;
    questionId: string;
    microTag: string;
    difficulty: Difficulty;
    optionId: string;
    isCorrect: boolean;
    scoreDelta: number;
    answeredAt: Date;
    /** Set on wrong answers so mistake history can be rebuilt from the session. */
    mistakeType?: MistakeType | null;
    misconceptionTag?: MisconceptionTag | null;
    /** A hint was revealed for this question before answering, so it earns no XP. */
    hintUsed?: boolean;
    /** Answered inside a misconception practice queue; excluded from the mastery score. */
    practice?: boolean;
    /** Answered inside a previous-class foundation round (practice is also true). */
    foundation?: boolean;
}

export interface SessionMisconception {
    microTag: string;
    mistakeType: MistakeType;
    misconceptionTag: MisconceptionTag;
}

export interface StoredQuizSession {
    id: string;
    kind: "mastery" | "weekly";
    studentUid: string;
    microTag: string;
    classLevel: 6 | 7 | 8;
    locale: Locale;
    status: "active" | "remedial_required" | "misconception_practice" | "foundation_practice" | "completed";
    questions: QuestionBankItem[];
    currentQuestionIndex: number;
    score: number;
    maxScore: number;
    hintedQuestionIds: string[];
    eventIds: string[];
    answers: StoredAnswer[];
    retryOf: string | null;
    remedialTag: string | null;
    /** Set when the session was started from an assigned homework. */
    homeworkId?: string | null;
    /** The lesson's title when the session started; micro-topics made in AI Studio are not in the bundled curriculum. */
    topicTitle?: string;
    /** Written by the server when the session is created; used to measure time spent. */
    startedAt?: TimestampLike;
    /** Targeted practice plus a re-check, served when a misconception is detected. */
    practiceQueue?: QuestionBankItem[];
    practiceIndex?: number;
    misconception?: SessionMisconception | null;
    /** The previous-class lessons with the same title as this one, found when the quiz started. */
    foundationSource?: FoundationSource | null;
    /** An earlier quiz on this lesson fell short of mastery, so one wrong answer opens the round. */
    struggledBefore?: boolean;
    /** The previous-class round in progress, or finished with its outcome. */
    foundation?: FoundationRound | null;
    /** Adaptive quizzes: candidates not served yet, unseen first; absent on weekly and older sessions. */
    pool?: QuestionBankItem[];
    /** How many of the lesson's own questions the quiz asks; the score is out of this. */
    questionCount?: number;
    /** The last answer on the lesson's own questions, which decides the next difficulty. */
    lastMainResult?: { difficulty: Difficulty; correct: boolean } | null;
}

/** The number of questions a quiz asks: fixed for adaptive quizzes, the list length otherwise. */
export const quizTotal = (session: Pick<StoredQuizSession, "questions" | "questionCount">) => session.questionCount ?? session.questions.length;

/** The question the student is answering now: from the main list, the practice queue or the foundation round. */
export function currentQuizQuestion(
    session: Pick<StoredQuizSession, "status" | "questions" | "currentQuestionIndex" | "practiceQueue" | "practiceIndex" | "foundation">,
): QuestionBankItem | undefined {
    if (session.status === "misconception_practice") return session.practiceQueue?.[session.practiceIndex ?? 0];
    if (session.status === "foundation_practice") return session.foundation?.queue[session.foundation.index];
    if (session.status !== "active") return undefined;
    return session.questions[session.currentQuestionIndex];
}

/** XP is derived from the stored answers so replays and retries stay idempotent. */
export function sessionXp(session: Pick<StoredQuizSession, "answers">): number {
    const unaidedCorrect = (session.answers ?? []).filter(
        (answer) => answer.isCorrect && !answer.hintUsed && !answer.practice,
    ).length;
    return XP_QUIZ_COMPLETED + unaidedCorrect * XP_FIRST_ATTEMPT_CORRECT;
}

/**
 * Scores the diagnostic. Every topic has three questions (easy, medium, hard) on one
 * previous-class foundation concept, so answers are matched to topics by question id.
 */
export function buildDiagnosticProfile(
    answers: StoredAnswer[],
    classLevel: 6 | 7 | 8,
    fallbackMicroTag: string | null,
    baselineDifficulty: Difficulty,
    /** The topics that exist now; lessons are recommended only from these. */
    concepts: MicroConcept[] = MICRO_CONCEPTS,
): DiagnosticProfile {
    const byTag = new Map(concepts.map((concept) => [concept.microTag, concept]));
    const getConcept = (microTag: string) => byTag.get(microTag);
    const answerById = new Map(answers.map((answer) => [answer.questionId, answer]));
    const blueprint = getDiagnosticBlueprint(classLevel);

    // Each of the five areas is scored out of its three questions.
    const topicResults: DiagnosticTopicResult[] = blueprint.map((topic) => {
        const answered = topic.questionIds.map((id) => answerById.get(id)).filter((answer): answer is StoredAnswer => Boolean(answer));
        const correct = answered.filter((answer) => answer.isCorrect).length;
        return {
            topicKey: topic.topicKey,
            title: topic.title,
            microTags: [topic.microTag],
            lessonTags: [...topic.lessonTags],
            correct,
            total: answered.length || topic.questionIds.length,
            band: topicBand(correct),
        };
    });

    // A foundation counts as strong when most of its three questions were right.
    const strongMicroTags = blueprint.filter((_, index) => topicResults[index].correct >= 2).map((topic) => topic.microTag);
    const weakMicroTags = blueprint.filter((_, index) => topicResults[index].correct < 2).map((topic) => topic.microTag);
    const overallCorrect = answers.filter((answer) => answer.isCorrect).length;
    const overallTotal = answers.length;

    // The whole test covers the previous class, so 60% or more means ready for the enrolled class.
    const accuracy = overallTotal ? overallCorrect / overallTotal : 0;
    const mathLevel = accuracy >= 0.6 ? classLevel : (classLevel - 1) as DiagnosticProfile["mathLevel"];

    // The weakest area leads the recommendation; ties resolve to the earliest area.
    const bandRank: Record<TopicBand, number> = { "very-weak": 0, weak: 1, "needs-practice": 2, strong: 3 };
    const weakestIndex = topicResults.reduce((best, topic, index) =>
        (bandRank[topic.band] < bandRank[topicResults[best].band] ? index : best), 0);
    const weakestTopic = topicResults[weakestIndex];
    const hasWeakness = Boolean(weakestTopic) && weakestTopic.correct < weakestTopic.total;
    const weakTag = hasWeakness ? blueprint[weakestIndex].microTag : null;
    const weakConcept = weakTag ? getConcept(weakTag) : undefined;
    const currentConcepts = concepts
        .filter((concept) => isLearningConceptForClass(concept, classLevel))
        .sort((left, right) => left.topicId.localeCompare(right.topicId) || left.order - right.order);

    // First, a lesson of this class that the weak topic leads straight into.
    let recommendedConcept = hasWeakness
        ? blueprint[weakestIndex].lessonTags.map((tag) => currentConcepts.find((concept) => concept.microTag === tag)).find(Boolean)
        : undefined;
    recommendedConcept ??= weakConcept?.classLevel === classLevel
        ? currentConcepts.find((concept) => concept.topicId === weakConcept.topicId)
        : undefined;

    // A weakness in an earlier class points at the concept in this class that builds on it.
    if (!recommendedConcept && weakConcept) {
        recommendedConcept = currentConcepts.find((concept) => {
            let prerequisite = concept.prerequisiteTag;
            // The depth limit guards against a prerequisite loop typed in by hand.
            for (let depth = 0; prerequisite && depth < 50; depth += 1) {
                if (prerequisite === weakConcept.microTag) return true;
                prerequisite = getConcept(prerequisite)?.prerequisiteTag ?? null;
            }
            return false;
        });
    }

    // With no lessons for the class yet, the diagnostic still scores; it just recommends none.
    recommendedConcept ??= currentConcepts.find((concept) => concept.microTag === fallbackMicroTag) ?? currentConcepts[0];

    return {
        assessedClassLevel: classLevel,
        mathLevel,
        baselineDifficulty,
        topicResults,
        overallCorrect,
        overallTotal,
        overallBand: overallBand(overallCorrect),
        strongMicroTags,
        weakMicroTags,
        weakMicroTag: weakConcept?.microTag ?? null,
        weakTopic: hasWeakness ? weakestTopic.title : null,
        recommendedMicroTag: recommendedConcept?.microTag ?? null,
        recommendedTopic: recommendedConcept?.topicTitle ?? null,
        accuracyPercent: overallTotal ? Math.round((overallCorrect / overallTotal) * 100) : 0,
    };
}

export function currentStoredQuestion<T extends { questions: QuestionBankItem[]; currentQuestionIndex: number }>(session: T) {
    return session.questions[session.currentQuestionIndex];
}

import type { Difficulty, Locale, MisconceptionTag, MistakeType, QuestionBankItem } from "@/types/curriculum";
import { getClassConcepts, getConcept } from "@/lib/curriculum";
import { XP_FIRST_ATTEMPT_CORRECT, XP_QUIZ_COMPLETED } from "@/lib/gamification";
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
    status: "active" | "remedial_required" | "misconception_practice" | "completed";
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
    /** Targeted practice plus a re-check, served when a misconception is detected. */
    practiceQueue?: QuestionBankItem[];
    practiceIndex?: number;
    misconception?: SessionMisconception | null;
}

/** XP is derived from the stored answers so replays and retries stay idempotent. */
export function sessionXp(session: Pick<StoredQuizSession, "answers">): number {
    const unaidedCorrect = (session.answers ?? []).filter(
        (answer) => answer.isCorrect && !answer.hintUsed && !answer.practice,
    ).length;
    return XP_QUIZ_COMPLETED + unaidedCorrect * XP_FIRST_ATTEMPT_CORRECT;
}

export function buildDiagnosticProfile(
    answers: StoredAnswer[],
    classLevel: 6 | 7 | 8,
    fallbackMicroTag: string,
    baselineDifficulty: Difficulty,
): DiagnosticProfile {
    const correctByTag = new Map<string, boolean>();
    for (const answer of answers) correctByTag.set(answer.microTag, answer.isCorrect);

    // Each of the five blueprint areas is scored out of its three questions.
    const topicResults: DiagnosticTopicResult[] = getDiagnosticBlueprint(classLevel).map((topic) => {
        const answered = topic.microTags.filter((microTag) => correctByTag.has(microTag));
        const correct = topic.microTags.filter((microTag) => correctByTag.get(microTag) === true).length;
        return {
            topicKey: topic.topicKey,
            title: topic.title,
            microTags: [...topic.microTags],
            correct,
            total: answered.length || topic.microTags.length,
            band: topicBand(correct),
        };
    });

    const strongMicroTags = [...correctByTag].filter(([, ok]) => ok).map(([microTag]) => microTag);
    const weakMicroTags = [...correctByTag].filter(([, ok]) => !ok).map(([microTag]) => microTag);
    const overallCorrect = answers.filter((answer) => answer.isCorrect).length;
    const overallTotal = answers.length;

    const currentClassAnswers = answers.filter((answer) => getConcept(answer.microTag)?.classLevel === classLevel);
    const currentClassAccuracy = currentClassAnswers.length
        ? currentClassAnswers.filter((answer) => answer.isCorrect).length / currentClassAnswers.length
        : 0;
    const mathLevel = currentClassAccuracy >= 0.6 ? classLevel : (classLevel - 1) as DiagnosticProfile["mathLevel"];

    // The weakest area leads the recommendation; ties resolve to the earliest area.
    const bandRank: Record<TopicBand, number> = { "very-weak": 0, weak: 1, "needs-practice": 2, strong: 3 };
    const weakestTopic = [...topicResults].sort((left, right) => bandRank[left.band] - bandRank[right.band])[0];
    const weakTag = weakestTopic?.microTags.find((microTag) => correctByTag.get(microTag) === false)
        ?? weakMicroTags[0]
        ?? null;
    const weakConcept = weakTag ? getConcept(weakTag) : undefined;
    const currentConcepts = getClassConcepts(classLevel);

    let recommendedConcept = weakConcept?.classLevel === classLevel
        ? currentConcepts.find((concept) => concept.topicId === weakConcept.topicId)
        : undefined;

    // A weakness in an earlier class points at the concept in this class that builds on it.
    if (!recommendedConcept && weakConcept) {
        recommendedConcept = currentConcepts.find((concept) => {
            let prerequisite = concept.prerequisiteTag;
            while (prerequisite) {
                if (prerequisite === weakConcept.microTag) return true;
                prerequisite = getConcept(prerequisite)?.prerequisiteTag ?? null;
            }
            return false;
        });
    }

    recommendedConcept ??= getConcept(fallbackMicroTag)?.classLevel === classLevel
        ? getConcept(fallbackMicroTag)
        : currentConcepts[0];
    if (!recommendedConcept) throw new Error(`No learning concept is available for Class ${classLevel}`);

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
        weakTopic: weakestTopic?.title ?? weakConcept?.topicTitle ?? null,
        recommendedMicroTag: recommendedConcept.microTag,
        recommendedTopic: recommendedConcept.topicTitle,
        accuracyPercent: overallTotal ? Math.round((overallCorrect / overallTotal) * 100) : 0,
    };
}

export function currentStoredQuestion<T extends { questions: QuestionBankItem[]; currentQuestionIndex: number }>(session: T) {
    return session.questions[session.currentQuestionIndex];
}

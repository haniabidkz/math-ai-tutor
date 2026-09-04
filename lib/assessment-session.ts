import type { Difficulty, Locale, MistakeType, QuestionBankItem } from "@/types/curriculum";
import { getClassConcepts, getConcept } from "@/lib/curriculum";
import { XP_FIRST_ATTEMPT_CORRECT, XP_QUIZ_COMPLETED } from "@/lib/gamification";
import type { DiagnosticProfile } from "@/types/assessment";

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
    /** A hint was revealed for this question before answering, so it earns no XP. */
    hintUsed?: boolean;
    /** Answered inside a misconception practice queue; excluded from the mastery score. */
    practice?: boolean;
}

export interface SessionMisconception {
    microTag: string;
    mistakeType: MistakeType;
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
    const grouped = new Map<string, boolean[]>();
    for (const answer of answers) {
        grouped.set(answer.microTag, [...(grouped.get(answer.microTag) ?? []), answer.isCorrect]);
    }
    const strongMicroTags: string[] = [];
    const weakMicroTags: string[] = [];
    for (const [microTag, results] of grouped) {
        const accuracy = results.filter(Boolean).length / results.length;
        (accuracy >= 0.7 ? strongMicroTags : weakMicroTags).push(microTag);
    }
    const correct = answers.filter((answer) => answer.isCorrect).length;
    const currentClassAnswers = answers.filter((answer) => getConcept(answer.microTag)?.classLevel === classLevel);
    const currentClassAccuracy = currentClassAnswers.length
        ? currentClassAnswers.filter((answer) => answer.isCorrect).length / currentClassAnswers.length
        : 0;
    const mathLevel = currentClassAccuracy >= 0.6 ? classLevel : (classLevel - 1) as DiagnosticProfile["mathLevel"];
    const weakAnswers = answers.filter((answer) => !answer.isCorrect);
    const weakAnswer = weakAnswers.find((answer) => getConcept(answer.microTag)?.classLevel === classLevel)
        ?? weakAnswers[0];
    const weakConcept = weakAnswer ? getConcept(weakAnswer.microTag) : undefined;
    const currentConcepts = getClassConcepts(classLevel);
    let recommendedConcept = weakConcept?.classLevel === classLevel
        ? currentConcepts.find((concept) => concept.topicId === weakConcept.topicId)
        : undefined;

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
        strongMicroTags,
        weakMicroTags,
        weakMicroTag: weakConcept?.microTag ?? null,
        weakTopic: weakConcept?.topicTitle ?? null,
        recommendedMicroTag: recommendedConcept.microTag,
        recommendedTopic: recommendedConcept.topicTitle,
        accuracyPercent: answers.length ? Math.round((correct / answers.length) * 100) : 0,
    };
}

export function currentStoredQuestion<T extends { questions: QuestionBankItem[]; currentQuestionIndex: number }>(session: T) {
    return session.questions[session.currentQuestionIndex];
}

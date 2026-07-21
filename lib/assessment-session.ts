import type { Difficulty, Locale, QuestionBankItem } from "@/types/curriculum";

export interface StoredAnswer {
    eventId: string;
    questionId: string;
    microTag: string;
    difficulty: Difficulty;
    optionId: string;
    isCorrect: boolean;
    scoreDelta: number;
    answeredAt: Date;
}

export interface StoredQuizSession {
    id: string;
    kind: "mastery" | "weekly";
    studentUid: string;
    microTag: string;
    classLevel: 6 | 7 | 8;
    locale: Locale;
    status: "active" | "remedial_required" | "completed";
    questions: QuestionBankItem[];
    currentQuestionIndex: number;
    score: number;
    maxScore: number;
    hintedQuestionIds: string[];
    eventIds: string[];
    answers: StoredAnswer[];
    retryOf: string | null;
    remedialTag: string | null;
}

export function buildDiagnosticProfile(
    answers: StoredAnswer[],
    classLevel: 6 | 7 | 8,
    fallbackMicroTag: string,
    baselineDifficulty: Difficulty,
) {
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
    return {
        assessedClassLevel: classLevel,
        baselineDifficulty,
        strongMicroTags,
        weakMicroTags,
        recommendedMicroTag: weakMicroTags[0] ?? fallbackMicroTag,
        accuracyPercent: answers.length ? Math.round((correct / answers.length) * 100) : 0,
    };
}

export function currentStoredQuestion<T extends { questions: QuestionBankItem[]; currentQuestionIndex: number }>(session: T) {
    return session.questions[session.currentQuestionIndex];
}

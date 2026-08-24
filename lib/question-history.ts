export interface HistoricalQuestionSession {
    kind?: string;
    microTag?: string;
    questions?: Array<{ id: string }>;
    startedAt?: Date | number | string | { toMillis?: () => number } | null;
}

function startedAtMillis(value: HistoricalQuestionSession["startedAt"]): number {
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value) || 0;
    if (value instanceof Date) return value.getTime();
    return value?.toMillis?.() ?? 0;
}

export function buildQuestionHistory(
    sessions: HistoricalQuestionSession[],
    isSameAssessment: (session: HistoricalQuestionSession) => boolean,
) {
    const relevant = sessions
        .filter(isSameAssessment)
        .sort((left, right) => startedAtMillis(right.startedAt) - startedAtMillis(left.startedAt));

    return {
        seenIds: [...new Set(relevant.flatMap((session) => session.questions?.map((question) => question.id) ?? []))],
        previousAttemptIds: relevant[0]?.questions?.map((question) => question.id) ?? [],
    };
}

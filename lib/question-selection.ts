import type { Difficulty, QuestionBankItem } from "@/types/curriculum";

function difficultyOrder(preferredDifficulty: Difficulty): Difficulty[] {
    if (preferredDifficulty === "hard") {
        return ["hard", "hard", "hard", "medium", "medium", "medium", "easy", "easy", "easy", "easy"];
    }
    if (preferredDifficulty === "medium") {
        return ["medium", "medium", "medium", "easy", "easy", "easy", "easy", "hard", "hard", "hard"];
    }
    return ["easy", "easy", "easy", "easy", "medium", "medium", "medium", "hard", "hard", "hard"];
}

export function selectQuizQuestionSet(
    questions: QuestionBankItem[],
    count: number,
    preferredDifficulty: Difficulty,
    excludedIds: Iterable<string> = [],
    previousAttemptIds: Iterable<string> = [],
): QuestionBankItem[] {
    const excluded = new Set(excludedIds);
    const previousAttempt = new Set(previousAttemptIds);
    const fresh = questions.filter((question) => !excluded.has(question.id));
    const nextCycle = questions.filter((question) => !previousAttempt.has(question.id));
    const selected: QuestionBankItem[] = [];
    const order = difficultyOrder(preferredDifficulty);

    for (let index = 0; selected.length < count && selected.length < questions.length; index += 1) {
        const target = order[index % order.length];
        const isUnused = (question: QuestionBankItem) => !selected.some((item) => item.id === question.id);
        const unusedFresh = fresh.filter(isUnused);
        const unusedNextCycle = nextCycle.filter(isUnused);
        const unused = unusedFresh.length
            ? unusedFresh
            : unusedNextCycle.length
                ? unusedNextCycle
                : questions.filter(isUnused);
        const candidate = unused.find((question) => question.difficulty === target) ?? unused[0];
        if (!candidate) break;
        selected.push(candidate);
    }

    return selected;
}

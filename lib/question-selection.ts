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

const createdMillis = (question: QuestionBankItem) => {
    const createdAt = (question as { createdAt?: { toMillis?: () => number } }).createdAt;
    return typeof createdAt?.toMillis === "function" ? createdAt.toMillis() : 0;
};

/**
 * Newest questions first, so a pool approved in AI Studio is what students meet next instead
 * of waiting behind older questions of the lesson. Questions added together keep id order.
 */
export function newestFirst(questions: QuestionBankItem[]): QuestionBankItem[] {
    return [...questions].sort((a, b) => createdMillis(b) - createdMillis(a) || a.id.localeCompare(b.id));
}

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

/** The adaptive ladder: a correct answer steps the difficulty up, a wrong one steps it down. */
export function nextDifficulty(previous: Difficulty, correct: boolean): Difficulty {
    const index = LEVELS.indexOf(previous);
    return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index + (correct ? 1 : -1)))];
}

/** A quiz always opens with two easy questions; from the third, the last answer decides. */
export const OPENING_EASY_COUNT = 2;

export function targetDifficulty(answered: number, last?: { difficulty: Difficulty; correct: boolean } | null): Difficulty {
    if (answered < OPENING_EASY_COUNT || !last) return "easy";
    return nextDifficulty(last.difficulty, last.correct);
}

/** Unseen questions first, then those not in the last attempt, then the rest; order within each group is kept. */
export function orderByFreshness(questions: QuestionBankItem[], excludedIds: Iterable<string> = [], previousAttemptIds: Iterable<string> = []): QuestionBankItem[] {
    const excluded = new Set(excludedIds);
    const previous = new Set(previousAttemptIds);
    const group = (question: QuestionBankItem) => (!excluded.has(question.id) ? 0 : !previous.has(question.id) ? 1 : 2);
    return [0, 1, 2].flatMap((wanted) => questions.filter((question) => group(question) === wanted));
}

/**
 * The next question of the wanted difficulty from the pool, or the nearest level that still
 * has one: a missing hard question falls back to medium, a missing easy one to medium.
 */
export function takeNextQuestion(pool: QuestionBankItem[], wanted: Difficulty): { question: QuestionBankItem; pool: QuestionBankItem[] } | null {
    const order: Difficulty[] = wanted === "easy" ? ["easy", "medium", "hard"] : wanted === "hard" ? ["hard", "medium", "easy"] : ["medium", "easy", "hard"];
    for (const level of order) {
        const index = pool.findIndex((question) => question.difficulty === level);
        if (index >= 0) return { question: pool[index], pool: [...pool.slice(0, index), ...pool.slice(index + 1)] };
    }
    return null;
}

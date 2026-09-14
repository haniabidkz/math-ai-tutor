import type { Difficulty } from "@/types/curriculum";

const difficultyOrder: Difficulty[] = ["easy", "medium", "hard"];

export function nextDiagnosticDifficulty(current: Difficulty, recentAnswers: boolean[]): Difficulty {
    const window = recentAnswers.slice(-3);
    if (window.length === 0) return current;
    const accuracy = window.filter(Boolean).length / window.length;
    const index = difficultyOrder.indexOf(current);
    if (accuracy >= 2 / 3) return difficultyOrder[Math.min(index + 1, difficultyOrder.length - 1)];
    if (accuracy <= 1 / 3) return difficultyOrder[Math.max(index - 1, 0)];
    return current;
}

/**
 * Only correct answers move the score. Wrong answers and hints leave it unchanged,
 * so a student's marks can never drop because of a mistake.
 */
export function scoreDelta(event: "correct" | "incorrect" | "hint", _hintAlreadyUsed = false): number {
    return event === "correct" ? 1 : 0;
}

/**
 * Students no longer pick a difficulty. The level starts from their diagnostic baseline and
 * shifts one step with how they last did on this concept.
 */
export function chooseQuizDifficulty(input: {
    baseline?: Difficulty | null;
    adaptiveLevel?: number | null;
    conceptPercentage?: number | null;
}): Difficulty {
    const fromLevel = (level: number): Difficulty => (level <= 1 ? "easy" : level === 2 ? "medium" : "hard");
    const start: Difficulty = input.baseline && difficultyOrder.includes(input.baseline)
        ? input.baseline
        : typeof input.adaptiveLevel === "number" && input.adaptiveLevel > 0
            ? fromLevel(input.adaptiveLevel)
            : "medium";
    const index = difficultyOrder.indexOf(start);
    const percentage = input.conceptPercentage;
    if (typeof percentage === "number" && percentage >= 85) return difficultyOrder[Math.min(index + 1, 2)];
    if (typeof percentage === "number" && percentage > 0 && percentage < 50) return difficultyOrder[Math.max(index - 1, 0)];
    return start;
}

export function masteryPercentage(score: number, maxScore: number): number {
    if (maxScore <= 0) return 0;
    return Math.max(0, Math.min(100, (score / maxScore) * 100));
}

export function isMastered(score: number, maxScore: number, threshold = 70): boolean {
    return masteryPercentage(score, maxScore) >= threshold;
}

export function isWeeklyAssessmentDue(nextAssessmentAt: Date | null | undefined, now = new Date()): boolean {
    return Boolean(nextAssessmentAt && nextAssessmentAt.getTime() <= now.getTime());
}

export function addDays(date: Date, days: number): Date {
    return new Date(date.getTime() + days * 86_400_000);
}

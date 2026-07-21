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

export function scoreDelta(event: "correct" | "incorrect" | "hint", hintAlreadyUsed = false): number {
    if (event === "correct") return 1;
    if (event === "incorrect") return -1;
    return hintAlreadyUsed ? 0 : -0.5;
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

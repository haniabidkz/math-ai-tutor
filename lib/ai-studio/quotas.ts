import type { AssessmentConfig, Difficulty } from "@/types/curriculum";
import type { GenerationLevel, GenerationStep, Quota } from "@/lib/ai-studio/types";

/** The exact counts from the content specification. Editable in Super Admin → Configuration. */
export const DEFAULT_QUOTAS: Record<GenerationLevel, Quota> = {
    micro: { easy: 10, medium: 10, hard: 10 },
    sub: { easy: 15, medium: 20, hard: 10 },
    main: { easy: 20, medium: 20, hard: 20 },
};

export const LEVEL_LABELS: Record<GenerationLevel, string> = {
    micro: "Micro-topic",
    sub: "Sub-topic (Checkpoint)",
    main: "Main topic (Mastery Pool)",
};

/** Questions per model call; small enough to finish well inside a function's time limit. */
export const BATCH_SIZE = 10;

export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export function quotaTotal(quota: Quota): number {
    return quota.easy + quota.medium + quota.hard;
}

/** Reads a level's quota from the saved configuration, falling back to the defaults. */
export function quotaFor(level: GenerationLevel, config?: Partial<AssessmentConfig> | null): Quota {
    const prefix = level === "micro" ? "quotaMicro" : level === "sub" ? "quotaSub" : "quotaMain";
    const read = (difficulty: "Easy" | "Medium" | "Hard", fallback: number) => {
        const value = Number((config as Record<string, unknown> | null | undefined)?.[`${prefix}${difficulty}`]);
        return Number.isInteger(value) && value >= 0 ? value : fallback;
    };
    const defaults = DEFAULT_QUOTAS[level];
    return { easy: read("Easy", defaults.easy), medium: read("Medium", defaults.medium), hard: read("Hard", defaults.hard) };
}

/** A concept step, then one step per batch of up to ten questions of a single difficulty. */
export function planSteps(quota: Quota): GenerationStep[] {
    const steps: GenerationStep[] = [{ id: "concept", kind: "concept", status: "pending", attempts: 0 }];
    for (const difficulty of DIFFICULTIES) {
        let remaining = quota[difficulty];
        let part = 1;
        while (remaining > 0) {
            const count = Math.min(BATCH_SIZE, remaining);
            steps.push({ id: `${difficulty}-${part}`, kind: "questions", difficulty, count, status: "pending", attempts: 0 });
            remaining -= count;
            part += 1;
        }
    }
    return steps;
}

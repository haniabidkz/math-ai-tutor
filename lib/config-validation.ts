import { DIAGNOSTIC_QUESTION_COUNT } from "@/lib/diagnostic-blueprint";
import { DEFAULT_ASSESSMENT_CONFIG, type AssessmentConfig } from "@/types/curriculum";

/** The settings a Super Admin can change, with their allowed ranges. */
export const CONFIG_LIMITS = {
    masteryQuestionCount: { min: 5, max: 10, label: "Mastery question count" },
    weeklyQuestionCount: { min: 5, max: 10, label: "Weekly question count" },
    weeklyIntervalDays: { min: 1, max: 30, label: "Weekly interval (days)" },
    masteryThresholdPercent: { min: 50, max: 100, label: "Mastery threshold (%)" },
    misconceptionThreshold: { min: 2, max: 5, label: "Repeats before a misconception" },
    misconceptionPracticeCount: { min: 1, max: 3, label: "Practice questions per misconception" },
    quotaMicroEasy: { min: 1, max: 30, label: "Micro-topic: easy" },
    quotaMicroMedium: { min: 1, max: 30, label: "Micro-topic: medium" },
    quotaMicroHard: { min: 1, max: 30, label: "Micro-topic: hard" },
    quotaSubEasy: { min: 1, max: 30, label: "Sub-topic: easy" },
    quotaSubMedium: { min: 1, max: 30, label: "Sub-topic: medium" },
    quotaSubHard: { min: 1, max: 30, label: "Sub-topic: hard" },
    quotaMainEasy: { min: 1, max: 30, label: "Main topic: easy" },
    quotaMainMedium: { min: 1, max: 30, label: "Main topic: medium" },
    quotaMainHard: { min: 1, max: 30, label: "Main topic: hard" },
} as const;

export type EditableConfigKey = keyof typeof CONFIG_LIMITS;
export const EDITABLE_CONFIG_KEYS = Object.keys(CONFIG_LIMITS) as EditableConfigKey[];
/** AI Studio question counts, shown as their own table in Configuration. */
export const QUOTA_CONFIG_KEYS = EDITABLE_CONFIG_KEYS.filter((key) => key.startsWith("quota"));
export const ASSESSMENT_CONFIG_KEYS = EDITABLE_CONFIG_KEYS.filter((key) => !key.startsWith("quota"));

/** Values that are fixed by the product rules and never taken from the request. */
const FIXED_VALUES: Pick<AssessmentConfig, "diagnosticQuestionCount" | "scoreCorrect" | "scoreHint" | "scoreIncorrect"> = {
    diagnosticQuestionCount: DIAGNOSTIC_QUESTION_COUNT,
    scoreCorrect: 1,
    scoreHint: 0,
    scoreIncorrect: 0,
};

/**
 * Out-of-range values are rejected with a message instead of being silently replaced,
 * which previously made saved changes look as if they had not been kept.
 */
export function validateConfigInput(body: Record<string, unknown>): { ok: true; config: AssessmentConfig } | { ok: false; error: string } {
    const config: AssessmentConfig = { ...DEFAULT_ASSESSMENT_CONFIG, ...FIXED_VALUES };
    for (const key of EDITABLE_CONFIG_KEYS) {
        const { min, max, label } = CONFIG_LIMITS[key];
        const raw = body[key];
        const value = typeof raw === "string" && raw.trim() === "" ? Number.NaN : Number(raw);
        if (!Number.isInteger(value) || value < min || value > max) {
            return { ok: false, error: `${label} must be a whole number from ${min} to ${max}.` };
        }
        config[key] = value;
    }
    return { ok: true, config };
}

/** Stored settings merged over the defaults, so every field always has a value to show. */
export function effectiveConfig(stored: Partial<AssessmentConfig> | undefined | null): AssessmentConfig {
    const merged: AssessmentConfig = { ...DEFAULT_ASSESSMENT_CONFIG };
    for (const key of EDITABLE_CONFIG_KEYS) {
        const value = Number(stored?.[key]);
        const { min, max } = CONFIG_LIMITS[key];
        if (Number.isInteger(value) && value >= min && value <= max) merged[key] = value;
    }
    return { ...merged, ...FIXED_VALUES };
}

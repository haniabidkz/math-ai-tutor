import { describe, expect, it } from "vitest";
import { CONFIG_LIMITS, EDITABLE_CONFIG_KEYS, QUOTA_CONFIG_KEYS, effectiveConfig, validateConfigInput } from "@/lib/config-validation";

const valid = {
    masteryQuestionCount: 8,
    weeklyQuestionCount: 6,
    weeklyIntervalDays: 7,
    masteryThresholdPercent: 75,
    misconceptionThreshold: 3,
    misconceptionPracticeCount: 2,
    quotaMicroEasy: 10, quotaMicroMedium: 10, quotaMicroHard: 10,
    quotaSubEasy: 15, quotaSubMedium: 20, quotaSubHard: 10,
    quotaMainEasy: 20, quotaMainMedium: 20, quotaMainHard: 20,
};

describe("configuration validation", () => {
    it("accepts values inside every range", () => {
        const result = validateConfigInput(valid);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.config.masteryQuestionCount).toBe(8);
    });

    it("accepts numbers sent as text from form inputs", () => {
        const result = validateConfigInput({ ...valid, masteryQuestionCount: "9" });
        expect(result.ok && result.config.masteryQuestionCount).toBe(9);
    });

    it("rejects out-of-range values with a clear message instead of changing them", () => {
        const result = validateConfigInput({ ...valid, masteryQuestionCount: 15 });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain("Mastery question count must be a whole number from 5 to 10");
    });

    it("rejects blanks, fractions and text", () => {
        expect(validateConfigInput({ ...valid, weeklyIntervalDays: "" }).ok).toBe(false);
        expect(validateConfigInput({ ...valid, masteryThresholdPercent: 70.5 }).ok).toBe(false);
        expect(validateConfigInput({ ...valid, misconceptionThreshold: "abc" }).ok).toBe(false);
    });

    it("keeps the fixed rules no matter what is sent", () => {
        const result = validateConfigInput({ ...valid, diagnosticQuestionCount: 12, scoreIncorrect: -1, scoreHint: -0.5 });
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.config.diagnosticQuestionCount).toBe(15);
            expect(result.config.scoreIncorrect).toBe(0);
            expect(result.config.scoreHint).toBe(0);
        }
    });
});

describe("effective configuration", () => {
    it("fills fields missing from older saved settings with defaults", () => {
        const config = effectiveConfig({ masteryQuestionCount: 7 });
        expect(config.masteryQuestionCount).toBe(7);
        expect(config.misconceptionThreshold).toBe(3);
        for (const key of EDITABLE_CONFIG_KEYS) {
            expect(config[key]).toBeGreaterThanOrEqual(CONFIG_LIMITS[key].min);
            expect(config[key]).toBeLessThanOrEqual(CONFIG_LIMITS[key].max);
        }
    });

    it("gives settings saved before AI Studio the question counts from the specification", () => {
        const config = effectiveConfig({ masteryQuestionCount: 7 });
        expect(QUOTA_CONFIG_KEYS).toHaveLength(9);
        expect([config.quotaMicroEasy, config.quotaMicroMedium, config.quotaMicroHard]).toEqual([10, 10, 10]);
        expect([config.quotaSubEasy, config.quotaSubMedium, config.quotaSubHard]).toEqual([15, 20, 10]);
        expect([config.quotaMainEasy, config.quotaMainMedium, config.quotaMainHard]).toEqual([20, 20, 20]);
        expect(validateConfigInput({ ...valid, quotaSubHard: 0 }).ok).toBe(false);
    });

    it("overrides the old negative scoring still stored in production", () => {
        const config = effectiveConfig({ scoreIncorrect: -1, scoreHint: -0.5, diagnosticQuestionCount: 12 } as never);
        expect(config.scoreIncorrect).toBe(0);
        expect(config.scoreHint).toBe(0);
        expect(config.diagnosticQuestionCount).toBe(15);
    });
});

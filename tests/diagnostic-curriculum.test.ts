import { describe, expect, it } from "vitest";
import { getDiagnosticConceptSequence, normalizeDiagnosticQuestionCount } from "@/lib/curriculum";

describe("diagnostic curriculum", () => {
    it.each([6, 7, 8] as const)("builds a balanced 15-question Class %s sequence", (classLevel) => {
        const sequence = getDiagnosticConceptSequence(classLevel, 15);
        expect(sequence).toHaveLength(15);
        expect(sequence.filter((concept) => concept.classLevel === classLevel - 1)).toHaveLength(6);
        expect(sequence.filter((concept) => concept.classLevel === classLevel)).toHaveLength(9);
        expect(new Set(sequence.filter((concept) => concept.classLevel === classLevel).map((concept) => concept.topicId)).size).toBeGreaterThan(1);
    });

    it("keeps configured diagnostics within the required 12 to 15 range", () => {
        expect(normalizeDiagnosticQuestionCount(24)).toBe(15);
        expect(normalizeDiagnosticQuestionCount(10)).toBe(12);
        expect(normalizeDiagnosticQuestionCount(13)).toBe(13);
    });
});

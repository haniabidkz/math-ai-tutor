import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiagnosticResultCard } from "@/components/diagnostic-result";
import { buildDiagnosticProfile, type StoredAnswer } from "@/lib/assessment-session";
import { getDiagnosticQuestionOrder } from "@/lib/diagnostic-questions";
import { toDiagnosticSummary } from "@/lib/diagnostic-summary";

function answersFor(classLevel: 6 | 7 | 8, correct: (index: number) => boolean): StoredAnswer[] {
    return getDiagnosticQuestionOrder(classLevel).map((question, index) => ({
        eventId: `e-${index}`, questionId: question.id, microTag: question.microTag, difficulty: question.difficulty,
        optionId: "A", isCorrect: correct(index), scoreDelta: correct(index) ? 1 : 0, answeredAt: new Date(),
    }));
}

describe("the diagnostic result for parents and teachers", () => {
    it("carries the same figures the student saw", () => {
        const profile = buildDiagnosticProfile(answersFor(8, (index) => index < 10), 8, null, "medium");
        const summary = toDiagnosticSummary(profile)!;
        expect(summary).toMatchObject({ assessedClassLevel: 8, mathLevel: 8, correct: 10, total: 15, accuracyPercent: 67, band: "needs-practice" });
        expect(summary.topics).toHaveLength(5);
        expect(summary.topics[0]).toMatchObject({ correct: 3, total: 3, band: "strong", bandLabel: { english: "Strong" } });
        expect(summary.topics[4]).toMatchObject({ correct: 0, total: 3, band: "very-weak" });
        expect(summary.weakTopic?.english).toBe("Algebra & Linear Equations");
    });

    it("is null until the test is taken, and tolerates older results", () => {
        expect(toDiagnosticSummary(null)).toBeNull();
        expect(toDiagnosticSummary({})).toBeNull();
        const old = toDiagnosticSummary({ assessedClassLevel: 6, overallCorrect: 13, overallTotal: 15, topicResults: [] } as never)!;
        expect(old).toMatchObject({ mathLevel: 6, band: "strong", accuracyPercent: 87, topics: [] });
    });

    it("renders the score, the level and each area", () => {
        const profile = buildDiagnosticProfile(answersFor(6, (index) => index % 3 !== 2), 6, null, "medium");
        render(<DiagnosticResultCard summary={toDiagnosticSummary(profile)} studentName="Ali" />);
        expect(screen.getByText("10 / 15")).toBeInTheDocument();
        // Enrolled class and the maths level found are both Class 6 here.
        expect(screen.getAllByText("Class 6", { selector: "dd" })).toHaveLength(2);
        // The first area is also the weakest, so its title shows twice: in the areas and as the weakest.
        expect(screen.getByText("Whole Numbers & Basic Operations", { selector: "p" })).toBeInTheDocument();
        expect(screen.getByText("Whole Numbers & Basic Operations", { selector: "dd" })).toBeInTheDocument();
        expect(screen.getAllByText("Needs Practice").length).toBeGreaterThan(0);
    });

    it("says so when the test has not been taken", () => {
        render(<DiagnosticResultCard summary={null} studentName="Sara" />);
        expect(screen.getByText("Sara has not taken the diagnostic test yet.")).toBeInTheDocument();
    });
});

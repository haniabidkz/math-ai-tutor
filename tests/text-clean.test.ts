import { describe, expect, it } from "vitest";
import { cleanMathText, findQuestionArtifacts, findTextArtifacts } from "@/lib/text-clean";

describe("clean question text", () => {
    it("strips markdown, LaTeX wrappers and odd spacing", () => {
        expect(cleanMathText("Solve  \\( 2x + 3 = 7 \\)  ??")).toBe("Solve 2x + 3 = 7?");
        expect(cleanMathText("What is $\\frac{3}{4} \\times 8$ ?")).toBe("What is 3/4 × 8?");
        expect(cleanMathText("Find **x** when x \\div 2 = 5 .")).toBe("Find x when x ÷ 2 = 5.");
        expect(cleanMathText("​A roti is cut into 6 parts.")).toBe("A roti is cut into 6 parts.");
    });

    it("leaves clean text alone", () => {
        const clean = "T = {1, 4, 7} and S = {7, 8}. Which sign between T and S gives {1, 4, 7, 8}?";
        expect(cleanMathText(clean)).toBe(clean);
        expect(findTextArtifacts(clean)).toEqual([]);
    });

    it("reports placeholder boxes and blanks instead of hiding them", () => {
        expect(findTextArtifacts("x + □ = 3")).toEqual(["a placeholder box (□)"]);
        expect(findTextArtifacts("Which sign makes T □ S = {1, 4, 7, 8} correct?")).toEqual(["a placeholder box (□)"]);
        expect(findTextArtifacts("3 + ___ = 5", "[ ]")).toEqual(["a blank (___)", "empty brackets [ ]"]);
        expect(findTextArtifacts("Fill in the blank: 2 + 2")).toEqual(["a fill-in-the-blank"]);
    });

    it("lets an option be a pair of brackets, but not the question", () => {
        expect(findQuestionArtifacts("Which pair of marks goes around the elements of a set?", ["( )", "[ ]", "{ }", "< >"])).toEqual([]);
        expect(findQuestionArtifacts("Write the set [ ] of even numbers", ["2", "4"])).toEqual(["empty brackets [ ]"]);
        expect(findQuestionArtifacts("A set is a ___ collection.", ["well-defined", "□"])).toEqual(["a blank (___)", "a placeholder box (□)"]);
    });
});

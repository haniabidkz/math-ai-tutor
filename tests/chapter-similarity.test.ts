import { describe, expect, it } from "vitest";
import { findSimilarChapter, normalizeTitle, titleSimilarity } from "@/lib/concept-autofill";
import { buildTarget } from "@/lib/ai-studio/target";
import type { MicroConcept } from "@/types/curriculum";

const same = (english: string) => ({ english, romanUrdu: english });

function concept(microTag: string, topicId: string, topicTitle: string, order = 0): MicroConcept {
    return {
        microTag, prerequisiteTag: null, classLevel: 8, topicId, topicTitle: same(topicTitle), title: same(microTag),
        concept: same("Explanation."), family: "ratio", visualKind: "ratio", order, status: "published",
    };
}

const chapters = [
    { topicId: "class8-operations-on-sets", title: same("Operations on Sets") },
    { topicId: "class8-sets", title: same("Sets") },
    { topicId: "class8-percentages", title: same("Percentages") },
];

describe("chapter names", () => {
    it("compares names without case, spacing or punctuation", () => {
        expect(normalizeTitle("  Operations ON Sets! ")).toBe("operations on sets");
        expect(titleSimilarity("Operations of Sets", "Operations on Sets")).toBeGreaterThan(0.8);
        expect(titleSimilarity("Sets", "Percentages")).toBeLessThan(0.3);
    });

    it("finds the chapter a typed name really means, and nothing for a new chapter", () => {
        expect(findSimilarChapter("operations on sets", chapters)?.topicId).toBe("class8-operations-on-sets");
        expect(findSimilarChapter("Operations of Sets", chapters)?.topicId).toBe("class8-operations-on-sets");
        expect(findSimilarChapter("Geometry", chapters)).toBeNull();
        expect(findSimilarChapter("", chapters)).toBeNull();
    });

    it("stops the Studio from doubling a chapter under a slipped name", () => {
        const concepts = [concept("c8-union-of-sets", "class8-operations-on-sets", "Operations on Sets")];
        const slipped = buildTarget({ level: "micro", classLevel: 8, chapter: { topicId: null, title: "Operations of Sets" }, microTopic: { microTag: null, title: "Intersection of sets" } }, concepts);
        expect("error" in slipped && slipped.error).toMatch(/looks like the existing main topic "Operations on Sets"/);
        const sameName = buildTarget({ level: "micro", classLevel: 8, chapter: { topicId: null, title: "operations on sets" }, microTopic: { microTag: null, title: "Intersection of sets" } }, concepts);
        expect("target" in sameName && sameName.target.chapter).toEqual({ topicId: "class8-operations-on-sets", title: "Operations on Sets" });
        const fresh = buildTarget({ level: "micro", classLevel: 8, chapter: { topicId: null, title: "Percentages" }, microTopic: { microTag: null, title: "Percent of a number" } }, concepts);
        expect("target" in fresh && fresh.target.chapter).toEqual({ topicId: null, title: "Percentages" });
    });
});

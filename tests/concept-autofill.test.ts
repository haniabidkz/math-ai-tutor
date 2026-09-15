import { describe, expect, it } from "vitest";
import {
    familyForTopic,
    slugify,
    suggestMicroTag,
    suggestTopicId,
    topicsForClass,
    visualForFamily,
    withRomanFallback,
} from "@/lib/concept-autofill";
import { MICRO_CONCEPTS } from "@/lib/curriculum";

describe("generated identifiers", () => {
    it("turns a title into a clean slug", () => {
        expect(slugify("Prime Factorisation")).toBe("prime-factorisation");
        expect(slugify("  Like vs. Unlike Terms! ")).toBe("like-vs-unlike-terms");
        expect(slugify("---")).toBe("");
    });

    it("builds a micro tag from the class and title", () => {
        expect(suggestMicroTag(6, "Prime Factorisation", [])).toBe("c6-prime-factorisation");
    });

    it("never reuses a tag that already exists", () => {
        expect(suggestMicroTag(6, "Constants", ["c6-constants"])).toBe("c6-constants-2");
        expect(suggestMicroTag(6, "Constants", ["c6-constants", "c6-constants-2"])).toBe("c6-constants-3");
    });

    it("builds a topic id from the class and topic name", () => {
        expect(suggestTopicId(7, "Data Handling", [])).toBe("class7-data-handling");
        expect(suggestTopicId(6, "Integers", ["class6-integers"])).toBe("class6-integers-2");
    });

    it("returns nothing until there is text to work from", () => {
        expect(suggestMicroTag(6, "", [])).toBe("");
        expect(suggestTopicId(6, "  ", [])).toBe("");
    });
});

describe("inferred fields", () => {
    it("picks a family from the class and topic name", () => {
        expect(familyForTopic(5, "Anything")).toBe("foundation");
        expect(familyForTopic(6, "Integers")).toBe("integer");
        expect(familyForTopic(7, "Linear Equations")).toBe("equation");
        expect(familyForTopic(8, "Ratio and Proportion")).toBe("ratio");
        expect(familyForTopic(7, "Algebraic Expressions")).toBe("algebra");
    });

    it("picks the matching visual for each family", () => {
        expect(visualForFamily("integer")).toBe("number-line");
        expect(visualForFamily("equation")).toBe("balance");
        expect(visualForFamily("ratio")).toBe("ratio");
    });

    it("lists a class's topics with the next position and natural prerequisite", () => {
        const topics = topicsForClass(MICRO_CONCEPTS, 6);
        const integers = topics.find((topic) => topic.topicId === "class6-integers")!;
        expect(integers.count).toBe(7);
        expect(integers.nextOrder).toBe(7);
        expect(integers.lastMicroTag).toBe("c6-integer-subtraction");
        expect(integers.family).toBe("integer");
        expect(integers.visualKind).toBe("number-line");
    });

    it("fills an empty Roman Urdu with the English", () => {
        expect(withRomanFallback({ english: " Ratio ", romanUrdu: "" })).toEqual({ english: "Ratio", romanUrdu: "Ratio" });
        expect(withRomanFallback({ english: "Ratio", romanUrdu: "Nisbat" })).toEqual({ english: "Ratio", romanUrdu: "Nisbat" });
    });
});

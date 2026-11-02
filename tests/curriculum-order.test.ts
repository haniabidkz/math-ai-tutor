import { describe, expect, it } from "vitest";
import { placementsFrom } from "@/lib/ai-studio/sequence";
import { classOutline, compareLessons, orderConcepts, sequenceUnconfirmed } from "@/lib/curriculum-order";
import type { MicroConcept } from "@/types/curriculum";

const text = (english: string) => ({ english, romanUrdu: english });

function concept(overrides: Partial<MicroConcept> & { microTag: string; topicId: string; order: number }): MicroConcept {
    return {
        prerequisiteTag: null, classLevel: 6, topicTitle: text(overrides.topicId), title: text(overrides.microTag), concept: text("…"),
        family: "algebra", visualKind: "expression", status: "published", ...overrides,
    } as MicroConcept;
}

describe("curriculum order", () => {
    it("orders chapters by their place, then sub-topics, then lessons, never by creation order", () => {
        const concepts = [
            concept({ microTag: "b-2", topicId: "chapter-b", topicOrder: 1, order: 1, createdAt: 1 } as never),
            concept({ microTag: "a-late-sub", topicId: "chapter-a", topicOrder: 0, subTopicOrder: 1, order: 0, createdAt: 2 } as never),
            concept({ microTag: "a-1", topicId: "chapter-a", topicOrder: 0, subTopicOrder: 0, order: 1, createdAt: 3 } as never),
            concept({ microTag: "a-0", topicId: "chapter-a", topicOrder: 0, subTopicOrder: 0, order: 0, createdAt: 4 } as never),
            concept({ microTag: "b-1", topicId: "chapter-b", topicOrder: 1, order: 0, createdAt: 5 } as never),
        ];
        expect(orderConcepts(concepts).map((item) => item.microTag)).toEqual(["a-0", "a-1", "a-late-sub", "b-1", "b-2"]);
    });

    it("breaks ties by creation time and then by tag, and leaves lessons without a sub-topic place last", () => {
        const first = concept({ microTag: "z", topicId: "c", order: 3, createdAt: 10 } as never);
        const second = concept({ microTag: "a", topicId: "c", order: 3, createdAt: 20 } as never);
        const sameTime = concept({ microTag: "m", topicId: "c", order: 3, createdAt: 10 } as never);
        expect(compareLessons(first, second)).toBeLessThan(0);
        expect(compareLessons(sameTime, first)).toBeLessThan(0);
        const grouped = concept({ microTag: "g", topicId: "c", subTopicOrder: 0, order: 9 } as never);
        expect(compareLessons(grouped, first)).toBeLessThan(0);
    });

    it("builds the outline and flags lessons whose place is unconfirmed", () => {
        const concepts = [
            concept({ microTag: "s-def", topicId: "sets", order: 0, subTopic: text("Introduction"), topicOrder: 0 }),
            concept({ microTag: "s-roster", topicId: "sets", order: 1, subTopic: text("Representation"), topicOrder: 0, sequence: { source: "unknown" } }),
            concept({ microTag: "hidden", topicId: "sets", order: 2, status: "archived" }),
            concept({ microTag: "found", topicId: "foundations", order: 0, foundationOnly: true }),
        ];
        const outline = classOutline(concepts, 6);
        expect(outline).toHaveLength(1);
        expect(outline[0].subTopics.map((group) => group.name)).toEqual(["Introduction", "Representation"]);
        expect(outline[0].subTopics[1].lessons[0]).toMatchObject({ microTag: "s-roster", unconfirmed: true });
        expect(sequenceUnconfirmed(concepts[0])).toBe(false);
    });

    it("turns a textbook proposal into ordering fields and refuses a broken one", () => {
        const concepts = [
            concept({ microTag: "s-def", topicId: "sets", order: 0, topicOrder: 1 }),
            concept({ microTag: "s-roster", topicId: "sets", order: 1, topicOrder: 1 }),
            concept({ microTag: "n-1", topicId: "numbers", order: 0, topicOrder: 0 }),
        ];
        const outline = classOutline(concepts, 6);
        const good = placementsFrom(outline, { chapters: [
            { topicId: "sets", subTopics: [{ name: "Intro", lessons: ["s-roster", "s-def"] }] },
            { topicId: "numbers", subTopics: [{ name: "Whole numbers", lessons: ["n-1"] }] },
        ], notes: "" });
        expect("placements" in good && good.placements).toEqual([
            { microTag: "s-roster", topicOrder: 0, subTopicOrder: 0, order: 0, subTopic: "Intro" },
            { microTag: "s-def", topicOrder: 0, subTopicOrder: 0, order: 1, subTopic: "Intro" },
            { microTag: "n-1", topicOrder: 1, subTopicOrder: 0, order: 0, subTopic: "Whole numbers" },
        ]);
        const dropped = placementsFrom(outline, { chapters: [{ topicId: "sets", subTopics: [{ name: "x", lessons: ["s-def"] }] }, { topicId: "numbers", subTopics: [{ name: "y", lessons: ["n-1"] }] }], notes: "" });
        expect("error" in dropped && dropped.error).toContain("left out");
        const moved = placementsFrom(outline, { chapters: [{ topicId: "sets", subTopics: [{ name: "x", lessons: ["s-def", "s-roster", "n-1"] }] }, { topicId: "numbers", subTopics: [] }], notes: "" });
        expect("error" in moved && moved.error).toContain("another chapter");
    });
});

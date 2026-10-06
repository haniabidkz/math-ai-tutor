import { describe, expect, it } from "vitest";
import { nextTopicOrder, topicsForClass } from "@/lib/concept-autofill";
import { buildConceptItems, orderClassConcepts } from "@/lib/learner-metrics";
import type { MicroConcept } from "@/types/curriculum";

const text = (english: string) => ({ english, romanUrdu: english });
const lesson = (microTag: string, topicId: string, order: number, extra: Partial<MicroConcept> & Record<string, unknown> = {}): MicroConcept => ({
    microTag, prerequisiteTag: null, classLevel: 6, topicId, topicTitle: text(topicId), title: text(microTag), concept: text("..."),
    family: "algebra", visualKind: "expression", order, status: "published", ...extra,
});

describe("chapters and lessons unlock in sequence", () => {
    const concepts = [
        lesson("b1", "chapter-b", 0, { topicOrder: 1 }), lesson("b2", "chapter-b", 1, { topicOrder: 1 }),
        lesson("a2", "chapter-a", 1, { topicOrder: 0 }), lesson("a1", "chapter-a", 0, { topicOrder: 0 }),
    ];

    it("orders chapters by their chapter order and lessons within them", () => {
        expect(orderClassConcepts(concepts, 6).map((concept) => concept.microTag)).toEqual(["a1", "a2", "b1", "b2"]);
        expect(topicsForClass(concepts, 6).map((topic) => [topic.topicId, topic.topicOrder])).toEqual([["chapter-a", 0], ["chapter-b", 1]]);
        expect(nextTopicOrder(topicsForClass(concepts, 6))).toBe(2);
    });

    it("opens one lesson at a time, across chapters, and names what to finish first", () => {
        const none = buildConceptItems(concepts, 6, new Map(), new Set());
        expect(none.map((concept) => [concept.microTag, concept.locked])).toEqual([["a1", false], ["a2", true], ["b1", true], ["b2", true]]);
        expect(none[1].blockedBy?.microTag).toBe("a1");
        expect(none[2].blockedBy?.microTag).toBe("a2");

        const progress = new Map([["a1", { mastered: true, percentage: 90 }], ["a2", { mastered: true, percentage: 80 }]]);
        const some = buildConceptItems(concepts, 6, progress, new Set());
        expect(some.map((concept) => concept.locked)).toEqual([false, false, false, true]);
        expect(some[3].blockedBy?.microTag).toBe("b1");
    });

    it("still honours a prerequisite named elsewhere in the class", () => {
        const withPrerequisite = concepts.map((concept) => (concept.microTag === "b2" ? { ...concept, prerequisiteTag: "a1" } : concept));
        const progress = new Map([["a2", { mastered: true }], ["b1", { mastered: true }]]);
        const items = buildConceptItems(withPrerequisite, 6, progress, new Set());
        expect(items.find((concept) => concept.microTag === "b2")).toMatchObject({ locked: true, blockedBy: { microTag: "a1" } });
    });

    it("falls back to creation order, then the id, when no chapter order is set", () => {
        const at = (ms: number) => ({ createdAt: { toMillis: () => ms } });
        const byCreation = [lesson("z1", "chapter-z", 0, at(1_000)), lesson("y1", "chapter-y", 0, at(2_000)), lesson("x1", "chapter-x", 0)];
        expect(orderClassConcepts(byCreation, 6).map((concept) => concept.microTag)).toEqual(["z1", "y1", "x1"]);
        expect(nextTopicOrder(topicsForClass(byCreation, 6))).toBe(3);
    });
});

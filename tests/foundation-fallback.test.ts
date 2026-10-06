import { describe, expect, it } from "vitest";
import {
    advanceFoundationRound, findPreviousClassTopic, foundationProgress, planFoundationRound, shouldOfferFoundation,
    type FoundationRound,
} from "@/lib/foundation-fallback";
import { QUESTION_BANK } from "@/lib/question-bank";
import type { MicroConcept } from "@/types/curriculum";

const text = (english: string) => ({ english, romanUrdu: english });

type Seed = Omit<Partial<MicroConcept>, "title" | "topicTitle"> & { microTag: string; classLevel: MicroConcept["classLevel"]; title: string; topicTitle: string };

function concept(overrides: Seed): MicroConcept {
    return {
        prerequisiteTag: null,
        topicId: `class${overrides.classLevel}-${overrides.topicTitle.toLowerCase().replace(/\W+/g, "-")}`,
        concept: text("..."),
        family: "ratio",
        visualKind: "fraction",
        order: 0,
        status: "published",
        ...overrides,
        title: text(overrides.title),
        topicTitle: text(overrides.topicTitle),
    };
}

const c8 = concept({ microTag: "c8-adding-unlike", classLevel: 8, title: "Adding unlike fractions", topicTitle: "Fractions" });
const questions = QUESTION_BANK.filter((question) => question.microTag === "c6-integers-intro");

describe("previous-class same-topic fallback", () => {
    it("finds the same lesson one class down, by title", () => {
        const concepts = [
            c8,
            concept({ microTag: "c7-adding-unlike", classLevel: 7, title: "Adding Unlike Fractions", topicTitle: "Fractions & Decimals", order: 2 }),
            concept({ microTag: "c7-equivalent", classLevel: 7, title: "Equivalent fractions", topicTitle: "Fractions & Decimals", order: 1 }),
            concept({ microTag: "c6-adding-unlike", classLevel: 6, title: "Adding unlike fractions", topicTitle: "Fractions" }),
        ];
        expect(findPreviousClassTopic(c8, concepts)).toMatchObject({ microTags: ["c7-adding-unlike"], classLevel: 7, matchedBy: "lesson" });
    });

    it("falls back to the whole chapter with the same title, in teaching order", () => {
        const concepts = [
            c8,
            concept({ microTag: "c7-fractions-2", classLevel: 7, title: "Subtracting fractions", topicTitle: "Fractions", order: 2 }),
            concept({ microTag: "c7-fractions-1", classLevel: 7, title: "Adding like fractions", topicTitle: "Fractions", order: 1 }),
            concept({ microTag: "c7-decimals", classLevel: 7, title: "Decimals", topicTitle: "Decimals" }),
        ];
        expect(findPreviousClassTopic(c8, concepts)).toMatchObject({ microTags: ["c7-fractions-1", "c7-fractions-2"], matchedBy: "chapter", title: text("Fractions") });
    });

    it("uses no unrelated, archived, diagnostic-only or other-class lessons", () => {
        const concepts = [
            c8,
            concept({ microTag: "c7-ratio", classLevel: 7, title: "Ratio basics", topicTitle: "Ratio" }),
            concept({ microTag: "c7-old", classLevel: 7, title: "Adding unlike fractions", topicTitle: "Fractions", status: "archived" }),
            concept({ microTag: "c7-diag", classLevel: 7, title: "Fractions", topicTitle: "Fractions", foundationOnly: true }),
            concept({ microTag: "c6-fractions", classLevel: 6, title: "Adding unlike fractions", topicTitle: "Fractions" }),
        ];
        expect(findPreviousClassTopic(c8, concepts)).toBeNull();
    });

    it("opens a round after two misses, or one miss on a lesson already failed before", () => {
        expect(shouldOfferFoundation({ wrongMainAnswers: 1, struggledBefore: false, alreadyOffered: false })).toBe(false);
        expect(shouldOfferFoundation({ wrongMainAnswers: 2, struggledBefore: false, alreadyOffered: false })).toBe(true);
        expect(shouldOfferFoundation({ wrongMainAnswers: 1, struggledBefore: true, alreadyOffered: false })).toBe(true);
        expect(shouldOfferFoundation({ wrongMainAnswers: 3, struggledBefore: true, alreadyOffered: true })).toBe(false);
    });

    it("plans rounds of four with the mastery threshold as the pass mark", () => {
        expect(planFoundationRound(questions.slice(0, 8), 70)).toMatchObject({ roundSize: 4, maxRounds: 2, passMark: 3, index: 0, round: 1 });
        // A stricter threshold never turns a round of four into "all four right".
        expect(planFoundationRound(questions.slice(0, 8), 80)?.passMark).toBe(3);
        expect(planFoundationRound(questions.slice(0, 8), 100)?.passMark).toBe(3);
        expect(planFoundationRound(questions.slice(0, 5), 70)?.queue).toHaveLength(4);
        expect(planFoundationRound(questions.slice(0, 3), 70)).toMatchObject({ roundSize: 3, maxRounds: 1, passMark: 3 });
        expect(planFoundationRound(questions.slice(0, 2), 70)).toBeNull();
    });

    it("resumes the quiz once a round is passed, after a second round when the first fails, or after the last", () => {
        const start = planFoundationRound(questions.slice(0, 8), 70)!;
        const play = (round: FoundationRound, answers: boolean[]) => answers.reduce((state, correct) => advanceFoundationRound(state.round, correct), { round, resume: false });

        const passed = play(start, [true, false, true, true]);
        expect(passed).toMatchObject({ resume: true, round: { outcome: "passed", correct: 3, index: 4 } });

        const second = play(start, [false, false, true, true]);
        expect(second).toMatchObject({ resume: false, round: { round: 2, correct: 0, index: 4 } });
        expect(foundationProgress({ microTags: [], title: text("Fractions"), topicTitle: text("Fractions"), classLevel: 7, matchedBy: "chapter" }, second.round))
            .toMatchObject({ number: 1, total: 4, round: 2, maxRounds: 2 });

        const failedBoth = play(second.round, [true, false, false, false]);
        expect(failedBoth).toMatchObject({ resume: true, round: { outcome: "not_passed", index: 8 } });

        const single = play(planFoundationRound(questions.slice(0, 4), 70)!, [false, false, true, false]);
        expect(single).toMatchObject({ resume: true, round: { outcome: "not_passed" } });
    });
});

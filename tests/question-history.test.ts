import { describe, expect, it } from "vitest";
import { buildQuestionHistory } from "@/lib/question-history";

describe("student question history", () => {
    it("collects every seen question and identifies the latest matching attempt", () => {
        const history = buildQuestionHistory([
            { kind: "mastery", microTag: "concept-a", questions: [{ id: "a-1" }, { id: "a-2" }], startedAt: 100 },
            { kind: "weekly", microTag: "weekly-review", questions: [{ id: "w-1" }], startedAt: 300 },
            { kind: "mastery", microTag: "concept-a", questions: [{ id: "a-3" }, { id: "a-4" }], startedAt: 200 },
            { kind: "mastery", microTag: "concept-b", questions: [{ id: "b-1" }], startedAt: 400 },
        ], (session) => session.kind === "mastery" && session.microTag === "concept-a");

        expect(new Set(history.seenIds)).toEqual(new Set(["a-1", "a-2", "a-3", "a-4"]));
        expect(history.previousAttemptIds).toEqual(["a-3", "a-4"]);
    });

    it("deduplicates question ids from retried or restored sessions", () => {
        const history = buildQuestionHistory([
            { kind: "diagnostic", questions: [{ id: "d-1" }, { id: "d-2" }], startedAt: new Date("2026-01-01") },
            { kind: "diagnostic", questions: [{ id: "d-2" }, { id: "d-3" }], startedAt: new Date("2026-01-02") },
        ], (session) => session.kind === "diagnostic");

        expect(history.seenIds).toHaveLength(3);
        expect(history.previousAttemptIds).toEqual(["d-2", "d-3"]);
    });
});

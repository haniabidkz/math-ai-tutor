import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiDraftReview } from "@/components/admin/ai-draft-review";
import { adminApi, ApiError } from "@/lib/admin-api";
import { dropRepeats, keepGoodQuestions, settleStep, stillNeeded } from "@/lib/ai-studio/batch-keep";
import { batchFocus } from "@/lib/ai-studio/prompts";
import { normalizeQuestionBatch, readQuestionBatch } from "@/lib/ai-studio/schema";
import type { GenerationDraft, GenerationStep } from "@/lib/ai-studio/types";
import type { Difficulty } from "@/types/curriculum";
import { draftQuestion, reviewDraft } from "./fixtures/ai-draft";

vi.mock("@/lib/admin-api", () => {
    class ApiError extends Error {
        constructor(message: string, public status: number, public body: Record<string, unknown>) {
            super(message);
        }
    }
    return { ApiError, adminApi: vi.fn(), jsonInit: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) }) };
});
const api = vi.mocked(adminApi);
const base = "/api/admin/ai-studio/drafts/d1";
beforeEach(() => {
    api.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
});

const rawQuestion = (index: number, overrides: Record<string, unknown> = {}) => ({
    micro_tag: "c6-integers-intro",
    question_text: `What is ${index} + 1?`,
    options: [`${index + 1}`, `${index + 2}`, `${index}`, `${index + 3}`],
    correct_option: "A",
    hint: { english: "Add one.", roman_urdu: "Aik jama karein." },
    step_by_step_explanation: { english: `${index} + 1 = ${index + 1}`, roman_urdu: `${index} + 1 = ${index + 1}` },
    wrong_option_analysis: ["B", "C", "D"].map((option) => ({ option, english: "Off by one.", roman_urdu: "Aik ka farq.", misconception_tag: "off-by-one-count" })),
    ...overrides,
});
const expected = { difficulty: "easy" as const, count: 3, allowedTags: ["c6-integers-intro"] };

describe("one broken question no longer throws away the good ones", () => {
    it("reads each question with its own problems, while a single rewrite stays all or nothing", () => {
        const reply = { questions: [rawQuestion(1), rawQuestion(2, { options: ["3", "3", "4", "5"] }), rawQuestion(3)] };
        const { read, countProblem } = readQuestionBatch(reply, expected);
        expect(countProblem).toBeNull();
        expect(read.map((item) => item.problems.length)).toEqual([0, 1, 0]);
        expect(read[1].problems[0]).toContain("question 2 has repeated options");
        expect(normalizeQuestionBatch(reply, expected).questions).toEqual([]);
    });

    it("keeps the good questions of a reply and says why the others were refused", () => {
        const { read } = readQuestionBatch({ questions: [rawQuestion(1), rawQuestion(2, { question_text: "A pen costs 2 dollars. What do 3 pens cost?" }), rawQuestion(3)] }, expected);
        const { kept, refused } = keepGoodQuestions(read, { count: 3, existing: [], focus: [], countProblem: null });
        expect(kept.map((question) => question.questionText)).toEqual(["What is 1 + 1?", "What is 3 + 1?"]);
        expect(refused).toHaveLength(1);
        expect(refused[0]).toContain("question 2 uses a foreign setting");
    });

    it("refuses repeats of earlier questions, keeps no more than needed, and notes a short reply", () => {
        const { read, countProblem } = readQuestionBatch({ questions: [rawQuestion(1), rawQuestion(2)] }, expected);
        const repeat = keepGoodQuestions(read, { count: 3, existing: ["What is 1 + 1?"], focus: [], countProblem });
        expect(repeat.kept.map((question) => question.questionText)).toEqual(["What is 2 + 1?"]);
        expect(repeat.refused[0]).toContain("exactly 3 questions were required but 2 came back");
        expect(repeat.refused[1]).toContain("question 1 repeats an existing question");
        expect(keepGoodQuestions(read, { count: 1, existing: [], focus: [], countProblem: null }).kept).toHaveLength(1);
    });

    it("keeps a sub-topic batch spread over the micro-topics it was given", () => {
        const tags = ["c6-a", "c6-b"];
        const { read } = readQuestionBatch({ questions: [rawQuestion(1, { micro_tag: "c6-a" }), rawQuestion(2, { micro_tag: "c6-a" })] }, { ...expected, count: 2, allowedTags: tags });
        const { kept, refused } = keepGoodQuestions(read, { count: 2, existing: [], focus: tags, countProblem: null });
        expect(kept).toHaveLength(1);
        expect(refused[0]).toContain("must be about one of these micro-topics: c6-b");
    });

    it("drops a question that repeats one saved meanwhile by a batch running at the same time", () => {
        const saved = [draftQuestion({ questionText: "Ali has 25 rupees and spends 10 rupees on a pencil. How much money is left?" })];
        const twin = draftQuestion({ questionText: "Ali has 25 rupees and spends 10 rupees on a pencil. How much money is left now?" });
        const other = draftQuestion();
        const result = dropRepeats([twin, other], saved);
        expect(result.kept).toEqual([other]);
        expect(result.refused[0]).toContain("written at the same time");
    });

    it("settles a step: done, open with the good questions counted, or failed", () => {
        const step: GenerationStep = { id: "easy-1", kind: "questions", difficulty: "easy", count: 3, status: "running", attempts: 0, startedAt: 1, focus: ["x"] };
        expect(settleStep(step, { ok: true, kept: 3, refused: [], error: "" })).toMatchObject({ finished: true, step: { status: "done", attempts: 1 } });
        const partial = settleStep(step, { ok: true, kept: 2, refused: ["question 2 uses a foreign setting"], error: "" });
        expect(partial.progressed).toBe(true);
        expect(partial.step).toMatchObject({ status: "pending", kept: 2 });
        expect(partial.step.feedback?.[0]).toContain("2 question(s) of your last reply were kept; write 1 new one(s)");
        expect(partial.step.focus).toBeUndefined();
        expect(stillNeeded(partial.step)).toBe(1);
        const failed = settleStep(partial.step, { ok: false, kept: 0, refused: [], error: "busy" });
        expect(failed.step).toMatchObject({ status: "failed", kept: 2, error: "busy" });
        expect(failed.step.feedback).toEqual(partial.step.feedback);
        expect(settleStep(partial.step, { ok: true, kept: 1, refused: [], error: "" }).finished).toBe(true);
        expect(settleStep({ id: "concept", kind: "concept", status: "running", attempts: 0 }, { ok: true, kept: 0, refused: [], error: "" }).finished).toBe(true);
    });

    it("spreads batches that run together over different micro-topics", () => {
        const draft = reviewDraft({ easy: 0, medium: 0, hard: 0 }, {
            level: "sub",
            target: { ...reviewDraft({ easy: 0, medium: 0, hard: 0 }).target, microTopics: ["a", "b", "c", "d"].map((tag) => ({ microTag: tag, title: tag })) },
        });
        expect(batchFocus(draft, 2)).toEqual(["a", "b"]);
        expect(batchFocus(draft, 2, ["a", "b"])).toEqual(["c", "d"]);
    });
});

describe("the review page writes several batches at once and checks answers along the way", { timeout: 30_000 }, () => {
    /** A small fake server: each step adds its questions after a short wait. */
    function fakeStudio(steps: GenerationStep[], perStep: (step: GenerationStep, call: number) => number) {
        let state: GenerationDraft = reviewDraft({ easy: 0, medium: 0, hard: 0 }, { status: "generating", quota: { easy: 0, medium: 0, hard: 0 }, steps });
        const events: string[] = [];
        const calls = new Map<string, number>();
        let active = 0;
        let mostAtOnce = 0;
        let mostHardAtOnce = 0;
        const activeHard = new Set<string>();
        const checkedKeys: string[] = [];
        let checksActive = 0;
        let mostChecksAtOnce = 0;
        api.mockImplementation(async (path: string, init?: RequestInit) => {
            const method = init?.method ?? "GET";
            if (path === base && method === "GET") return { draft: state, liveTexts: [] };
            if (path === `${base}/generate`) {
                const { stepId } = JSON.parse(String(init!.body)) as { stepId: string };
                const step = state.steps.find((item) => item.id === stepId)!;
                const call = (calls.get(stepId) ?? 0) + 1;
                calls.set(stepId, call);
                events.push(`start:${stepId}`);
                active += 1;
                mostAtOnce = Math.max(mostAtOnce, active);
                if (step.difficulty === "hard") activeHard.add(stepId);
                mostHardAtOnce = Math.max(mostHardAtOnce, activeHard.size);
                await new Promise((resolve) => setTimeout(resolve, step.difficulty === "hard" ? 900 : 300));
                active -= 1;
                activeHard.delete(stepId);
                const kept = Math.min(perStep(step, call), (step.count ?? 0) - (step.kept ?? 0));
                const total = (step.kept ?? 0) + kept;
                const done = total >= (step.count ?? 0);
                state = {
                    ...state,
                    questions: [...state.questions, ...Array.from({ length: kept }, () => draftQuestion({ difficulty: step.difficulty as Difficulty, verification: { status: "pending" } }))],
                    steps: state.steps.map((item) => (item.id === stepId ? { ...item, attempts: item.attempts + 1, status: done ? "done" as const : "pending" as const, ...(done ? {} : { kept: total }) } : item)),
                };
                if (state.steps.every((item) => item.status === "done")) state = { ...state, status: "needs_review" };
                events.push(`end:${stepId}`);
                return { draft: state, kept };
            }
            if (path === `${base}/verify`) {
                events.push("verify");
                const { keys } = JSON.parse(String(init?.body ?? "{}")) as { keys?: string[] };
                for (const key of keys ?? []) checkedKeys.push(key);
                checksActive += 1;
                mostChecksAtOnce = Math.max(mostChecksAtOnce, checksActive);
                await new Promise((resolve) => setTimeout(resolve, 1_200));
                checksActive -= 1;
                const batch = state.questions.filter((question) => question.verification.status === "pending" && (!keys || keys.includes(question.key))).slice(0, 5).map((question) => question.key);
                state = { ...state, questions: state.questions.map((question) => (batch.includes(question.key) ? { ...question, verification: { status: "agrees" as const, aiAnswer: "A" as const } } : question)) };
                return { draft: state, checked: batch.length, remaining: state.questions.filter((question) => question.verification.status === "pending").length };
            }
            throw new ApiError(`Unexpected ${method} ${path}`, 500, {});
        });
        return { events, calls, checkedKeys, stats: () => ({ mostAtOnce, mostHardAtOnce }), mostChecksAtOnce: () => mostChecksAtOnce };
    }
    const batch = (id: string, difficulty: Difficulty, count = 3): GenerationStep => ({ id, kind: "questions", difficulty, count, status: "pending", attempts: 0 });

    it("runs up to three steps together, hard ones first and never three hard at once, and checks while writing", async () => {
        const steps: GenerationStep[] = [
            { id: "concept", kind: "concept", status: "done", attempts: 1 },
            batch("easy-1", "easy"), batch("easy-2", "easy"), batch("medium-1", "medium"),
            batch("hard-1", "hard"), batch("hard-2", "hard"), batch("hard-3", "hard"),
        ];
        const studio = fakeStudio(steps, (step) => step.count ?? 0);
        render(<AiDraftReview draftId="d1" autoRun onClose={vi.fn()} onPublished={vi.fn()} />);

        await waitFor(() => expect(screen.getByText("Answers checked: 18/18")).toBeInTheDocument(), { timeout: 15_000 });
        const starts = studio.events.filter((event) => event.startsWith("start:"));
        expect(starts.slice(0, 3)).toEqual(["start:hard-1", "start:hard-2", "start:medium-1"]);
        expect(studio.stats()).toEqual({ mostAtOnce: 3, mostHardAtOnce: 2 });
        // The first answers were checked before the last batch was written.
        const lastEnd = studio.events.map((event) => event.startsWith("end:")).lastIndexOf(true);
        expect(studio.events.indexOf("verify")).toBeLessThan(lastEnd);
        expect(screen.queryByText(/could not be finished/)).not.toBeInTheDocument();
        // Every answer was sent for checking once, and the last ones were checked several at a time.
        expect(new Set(studio.checkedKeys).size).toBe(studio.checkedKeys.length);
        expect(studio.checkedKeys).toHaveLength(18);
    });

    it("checks what is left at the end with several checks at once, each with its own questions", async () => {
        const steps: GenerationStep[] = [{ id: "concept", kind: "concept", status: "done", attempts: 1 }, batch("easy-1", "easy", 4), batch("easy-2", "easy", 4), batch("easy-3", "easy", 4)];
        const studio = fakeStudio(steps, (step) => step.count ?? 0);
        render(<AiDraftReview draftId="d1" autoRun onClose={vi.fn()} onPublished={vi.fn()} />);

        await waitFor(() => expect(screen.getByText("Answers checked: 12/12")).toBeInTheDocument(), { timeout: 15_000 });
        expect(studio.mostChecksAtOnce()).toBeGreaterThan(1);
        expect(new Set(studio.checkedKeys).size).toBe(12);
        expect(studio.checkedKeys).toHaveLength(12);
    });

    it("keeps asking a partly kept step for the rest without counting it as a failure", async () => {
        const steps: GenerationStep[] = [{ id: "concept", kind: "concept", status: "done", attempts: 1 }, batch("easy-1", "easy", 4)];
        // Each reply has only one usable question: four replies, all progress, none a failure.
        const studio = fakeStudio(steps, () => 1);
        render(<AiDraftReview draftId="d1" autoRun onClose={vi.fn()} onPublished={vi.fn()} />);

        await waitFor(() => expect(screen.getByText("Answers checked: 4/4")).toBeInTheDocument(), { timeout: 15_000 });
        expect(studio.calls.get("easy-1")).toBe(4);
        expect(screen.queryByText(/could not be finished/)).not.toBeInTheDocument();
    });
});

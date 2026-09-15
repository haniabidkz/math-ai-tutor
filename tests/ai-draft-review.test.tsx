import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AiDraftReview } from "@/components/admin/ai-draft-review";
import { adminApi, ApiError } from "@/lib/admin-api";
import type { GenerationDraft } from "@/lib/ai-studio/types";
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

/** Answers GET with the draft and records every other call. */
function serve(draft: GenerationDraft, handlers: Record<string, (body: Record<string, unknown>) => unknown> = {}) {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (path === base && method === "GET") return { draft, liveTexts: [] };
        const handler = handlers[`${method} ${path}`];
        if (!handler) throw new Error(`Unexpected ${method} ${path}`);
        return handler(init?.body ? JSON.parse(String(init.body)) : {});
    });
}

const approveButton = () => screen.getByRole("button", { name: /Approve & Push to Live Database/ });

beforeEach(() => {
    api.mockReset();
    vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("AI draft review (Rule C)", () => {
    it("unlocks approval only when every check passes, then pushes with the lesson choice", async () => {
        const ready = reviewDraft({ easy: 10, medium: 10, hard: 10 });
        const onPublished = vi.fn();
        serve(ready, { [`POST ${base}/approve`]: () => ({ questionIds: ready.questions.map((question) => question.key), microTag: null }) });
        render(<AiDraftReview draftId="d1" onClose={vi.fn()} onPublished={onPublished} />);

        await waitFor(() => expect(approveButton()).toBeEnabled());
        expect(screen.getByText("No problems left")).toBeInTheDocument();
        fireEvent.click(screen.getByLabelText(/Also use this explanation as the lesson/));
        fireEvent.click(approveButton());

        await waitFor(() => expect(onPublished).toHaveBeenCalled());
        const call = api.mock.calls.find(([path]) => path === `${base}/approve`)!;
        expect(JSON.parse(String(call[1]?.body))).toEqual({ replaceLesson: false });
        expect(await screen.findByText(/30 questions are now live/)).toBeInTheDocument();
    });

    it("keeps approval locked while the independent solve disagrees, until the admin confirms", async () => {
        const disputed = reviewDraft({ easy: 10, medium: 10, hard: 10 });
        disputed.questions[0] = draftQuestion({ key: "bad", verification: { status: "disagrees", aiAnswer: "C", note: "I got 10." } });
        const confirmed = { ...disputed, questions: disputed.questions.map((question) => (question.key === "bad" ? { ...question, verification: { ...question.verification, status: "confirmed" as const } } : question)) };
        serve(disputed, { [`PATCH ${base}`]: () => ({ draft: confirmed, addedKey: null }) });
        render(<AiDraftReview draftId="d1" onClose={vi.fn()} onPublished={vi.fn()} />);

        expect(await screen.findByText(/An independent AI solve chose/)).toBeInTheDocument();
        expect(approveButton()).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: /I checked: A is correct/ }));

        await waitFor(() => expect(approveButton()).toBeEnabled());
        const patch = api.mock.calls.find(([path, init]) => path === base && init?.method === "PATCH")!;
        expect(JSON.parse(String(patch[1]?.body))).toEqual({ op: "confirm", key: "bad" });
    });

    it("blocks approval when a difficulty is short and says which", async () => {
        serve(reviewDraft({ easy: 9, medium: 10, hard: 10 }));
        render(<AiDraftReview draftId="d1" onClose={vi.fn()} onPublished={vi.fn()} />);
        await waitFor(() => expect(screen.getByText("1 problem(s) left to fix")).toBeInTheDocument());
        expect(approveButton()).toBeDisabled();
    });

    it("saves an inline edit with reasons for the three wrong options only", async () => {
        const ready = reviewDraft({ easy: 10, medium: 10, hard: 10 });
        const first = ready.questions[0];
        serve(ready, { [`PATCH ${base}`]: () => ({ draft: ready, addedKey: null }) });
        render(<AiDraftReview draftId="d1" onClose={vi.fn()} onPublished={vi.fn()} />);

        await screen.findByText(first.questionText);
        fireEvent.click(screen.getAllByRole("button", { name: /^Edit$/ })[1]);
        fireEvent.change(screen.getByLabelText("Question"), { target: { value: "Sara has Rs. 50 and spends Rs. 20. How much is left?" } });
        fireEvent.click(screen.getAllByRole("radio", { name: /Correct answer/ })[1]);
        expect(approveButton()).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "Save question" }));

        await waitFor(() => expect(api.mock.calls.some(([path, init]) => path === base && init?.method === "PATCH")).toBe(true));
        const patch = api.mock.calls.find(([path, init]) => path === base && init?.method === "PATCH")!;
        const body = JSON.parse(String(patch[1]?.body));
        expect(body.op).toBe("question");
        expect(body.question.questionText).toContain("Sara has Rs. 50");
        expect(body.question.correctOption).toBe("B");
        expect(Object.keys(body.question.wrongReasons).sort()).toEqual(["A", "C", "D"]);
    });

    it("runs each step in order, retries a rejected reply, then checks the answers", async () => {
        const step = (id: string, status: "pending" | "done") =>
            (id === "concept" ? { id, kind: "concept" as const, status, attempts: 0 } : { id, kind: "questions" as const, difficulty: "easy" as const, count: 1, status, attempts: 0 });
        const fresh = reviewDraft({ easy: 0, medium: 0, hard: 0 }, { status: "generating", concept: null, quota: { easy: 1, medium: 0, hard: 0 }, steps: [step("concept", "pending"), step("easy-1", "pending")] });
        const afterConcept = { ...fresh, concept: reviewDraft({ easy: 0, medium: 0, hard: 0 }).concept, steps: [step("concept", "done"), step("easy-1", "pending")] };
        const finished = { ...afterConcept, status: "needs_review" as const, questions: [draftQuestion({ verification: { status: "pending" } })], steps: [step("concept", "done"), step("easy-1", "done")] };
        const checked = { ...finished, questions: finished.questions.map((question) => ({ ...question, verification: { status: "agrees" as const, aiAnswer: "A" as const } })) };

        const sent: string[] = [];
        let rejected = false;
        serve(fresh, {
            [`POST ${base}/generate`]: (body) => {
                sent.push(String(body.stepId));
                if (body.stepId === "concept") return { draft: afterConcept };
                if (!rejected) {
                    rejected = true;
                    throw new ApiError("The reply broke 1 rule(s)", 422, { code: "rejected", problems: ["question 1 uses a foreign setting (dollars)"], draft: afterConcept });
                }
                return { draft: finished };
            },
            [`POST ${base}/verify`]: () => { sent.push("verify"); return { draft: checked, checked: 1, remaining: 0 }; },
        });
        render(<AiDraftReview draftId="d1" autoRun onClose={vi.fn()} onPublished={vi.fn()} />);

        await waitFor(() => expect(sent).toEqual(["concept", "easy-1", "easy-1", "verify"]), { timeout: 4000 });
        await waitFor(() => expect(screen.getByText("Answers checked: 1/1")).toBeInTheDocument());
    });

    it("stops at once when the key is rejected instead of retrying", async () => {
        const fresh = reviewDraft({ easy: 0, medium: 0, hard: 0 }, { status: "generating", concept: null, steps: [{ id: "concept", kind: "concept", status: "pending", attempts: 0 }] });
        let calls = 0;
        serve(fresh, {
            [`POST ${base}/generate`]: () => {
                calls += 1;
                throw new ApiError("OpenAI rejected the API key. It may be revoked or mistyped.", 502, { code: "invalid_key" });
            },
        });
        render(<AiDraftReview draftId="d1" autoRun onClose={vi.fn()} onPublished={vi.fn()} />);
        expect(await screen.findByText(/OpenAI rejected the API key/)).toBeInTheDocument();
        expect(calls).toBe(1);
    });
});

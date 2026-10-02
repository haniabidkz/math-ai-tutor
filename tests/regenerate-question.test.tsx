import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RegenerateQuestionDialog } from "@/components/admin/regenerate-question";
import { adminApi } from "@/lib/admin-api";
import { QUESTION_BANK } from "@/lib/question-bank";
import type { QuestionBankItem } from "@/types/curriculum";

vi.mock("@/lib/admin-api", () => {
    class ApiError extends Error {
        constructor(message: string, public status: number, public body: Record<string, unknown>) {
            super(message);
        }
    }
    return { ApiError, adminApi: vi.fn(), jsonInit: (method: string, body: unknown) => ({ method, body: JSON.stringify(body) }) };
});

const api = vi.mocked(adminApi);
const question = QUESTION_BANK.find((item) => item.microTag === "c6-integers-intro")!;
const base = `/api/admin/questions/${question.id}/regenerate`;
const candidate: QuestionBankItem = { ...question, question: { english: "Which integer is 3 below zero?", romanUrdu: "Which integer is 3 below zero?" } };
const agrees = { status: "agrees" as const, aiAnswer: question.correctOptionId, onTopic: true };

// A block body: a returned mock would be run by vitest as a cleanup hook.
beforeEach(() => { api.mockReset(); });

describe("Regenerate for a live question", () => {
    it("writes, checks and replaces the question in one click when the check agrees", async () => {
        const calls: string[] = [];
        api.mockImplementation(async (path: string, init?: RequestInit) => {
            calls.push(`${init?.method} ${path}`);
            if (init?.method === "POST") return { candidate, passed: true, verification: agrees };
            if (init?.method === "PUT") return { question: { ...candidate, version: 2 } };
            throw new Error(`Unexpected ${init?.method} ${path}`);
        });
        const onReplaced = vi.fn();
        render(<RegenerateQuestionDialog question={question} onClose={vi.fn()} onReplaced={onReplaced} />);

        fireEvent.click(screen.getByRole("radio", { name: "Wrong answer" }));
        fireEvent.click(screen.getByRole("button", { name: /Regenerate and replace/ }));

        await waitFor(() => expect(onReplaced).toHaveBeenCalledWith(expect.objectContaining({ id: question.id, version: 2 })));
        expect(calls).toEqual([`POST ${base}`, `PUT ${base}`]);
        expect(JSON.parse(String((api.mock.calls[0][1] as RequestInit).body))).toEqual({ reason: "wrong" });
    });

    it("keeps the old question and offers another try when the check rejects the new version", async () => {
        api.mockImplementation(async (_path: string, init?: RequestInit) => {
            if (init?.method === "POST") return { candidate, passed: false, verification: { status: "disagrees", aiAnswer: "B", onTopic: true } };
            throw new Error(`Unexpected ${init?.method}`);
        });
        const onReplaced = vi.fn();
        render(<RegenerateQuestionDialog question={question} onClose={vi.fn()} onReplaced={onReplaced} />);

        fireEvent.click(screen.getByRole("button", { name: /Regenerate and replace/ }));

        expect(await screen.findByText(/So it did not replace the question/)).toBeInTheDocument();
        expect(screen.getByText(/it chose B/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Try again/ })).toBeInTheDocument();
        expect(onReplaced).not.toHaveBeenCalled();
        expect(api.mock.calls.every(([, init]) => (init as RequestInit)?.method !== "PUT")).toBe(true);
    });
});

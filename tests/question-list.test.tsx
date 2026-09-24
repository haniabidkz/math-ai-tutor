import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QuestionList, TYPED_CONFIRM_THRESHOLD } from "@/components/admin/question-list";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { DIAGNOSTIC_QUESTIONS } from "@/lib/diagnostic-questions";
import { QUESTION_BANK } from "@/lib/question-bank";

const practice = QUESTION_BANK.filter((question) => question.microTag === "c6-integers-intro" || question.microTag === "c6-constants");
const diagnostic = DIAGNOSTIC_QUESTIONS[7];
const questions = [...practice, ...diagnostic];

function renderList(onDelete = vi.fn().mockResolvedValue(true)) {
    render(<QuestionList questions={questions} concepts={MICRO_CONCEPTS} onEdit={vi.fn()} onDelete={onDelete} />);
    return onDelete;
}

const select = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { selector: "select" }), { target: { value } });
const button = (name: RegExp) => screen.getByRole("button", { name });

afterEach(() => vi.restoreAllMocks());

describe("question list bulk actions", { timeout: 30_000 }, () => {
    it("deletes only the ticked questions after one confirmation", async () => {
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
        const onDelete = renderList();
        fireEvent.click(screen.getByLabelText(`Select ${practice[0].id}`));
        fireEvent.click(screen.getByLabelText(`Select ${practice[3].id}`));
        fireEvent.click(button(/Delete selected \(2\)/));

        await waitFor(() => expect(onDelete).toHaveBeenCalledWith([practice[0].id, practice[3].id]));
        expect(confirm.mock.calls[0][0]).toContain("Delete 2 questions?");
        await waitFor(() => expect(button(/Delete selected \(0\)/)).toBeDisabled());
    });

    it("selects every question the filters show, and nothing hidden", async () => {
        vi.spyOn(window, "confirm").mockReturnValue(true);
        const onDelete = renderList();
        select("Concept", "c6-constants");
        fireEvent.click(screen.getByLabelText("Select all shown questions"));
        expect(screen.getByText(/Showing 20 of 55 · 20 selected/)).toBeInTheDocument();
        fireEvent.click(button(/Delete selected \(20\)/));

        await waitFor(() => expect(onDelete).toHaveBeenCalled());
        const ids: string[] = onDelete.mock.calls[0][0];
        expect(ids).toHaveLength(20);
        expect(ids.every((id) => id.startsWith("c6-constants-"))).toBe(true);
    });

    it("asks for the number to be typed before deleting many, and stops on a wrong number", async () => {
        const prompt = vi.spyOn(window, "prompt").mockReturnValueOnce("50").mockReturnValueOnce(String(questions.length));
        const onDelete = renderList();
        expect(questions.length).toBeGreaterThan(TYPED_CONFIRM_THRESHOLD);

        fireEvent.click(button(new RegExp(`Delete all \\(${questions.length}\\)`)));
        expect(onDelete).not.toHaveBeenCalled();

        fireEvent.click(button(new RegExp(`Delete all \\(${questions.length}\\)`)));
        await waitFor(() => expect(onDelete).toHaveBeenCalledWith(questions.map((question) => question.id)));
        expect(prompt.mock.calls[1][0]).toContain(`Type ${questions.length} to confirm.`);
        expect(prompt.mock.calls[1][0]).toContain("15 of them are diagnostic test questions");
    });

    it("filters diagnostic questions by the test they belong to", () => {
        renderList();
        select("Type", "diagnostic-7");
        expect(screen.getByText(/Showing 15 of 55/)).toBeInTheDocument();
        expect(button(/Delete all shown \(15\)/)).toBeEnabled();
        const row = screen.getByText("diag-c7-01").closest("tr")!;
        expect(within(row).getByText("Diagnostic · Class 7 test")).toBeInTheDocument();
        select("Type", "practice");
        expect(screen.getByText(/Showing 40 of 55/)).toBeInTheDocument();
        expect(screen.queryByText("diag-c7-01")).not.toBeInTheDocument();
    });

    it("clears the selection when the filters change", () => {
        renderList();
        fireEvent.click(screen.getByLabelText(`Select ${practice[0].id}`));
        expect(button(/Delete selected \(1\)/)).toBeEnabled();
        select("Difficulty", "hard");
        expect(button(/Delete selected \(0\)/)).toBeDisabled();
    });

    it("keeps the selection when a deletion is cancelled", () => {
        vi.spyOn(window, "confirm").mockReturnValue(false);
        const onDelete = renderList();
        fireEvent.click(screen.getByLabelText(`Delete ${practice[1].id}`));
        expect(onDelete).not.toHaveBeenCalled();
        fireEvent.click(screen.getByLabelText(`Select ${practice[1].id}`));
        fireEvent.click(button(/Delete selected \(1\)/));
        expect(onDelete).not.toHaveBeenCalled();
        expect(button(/Delete selected \(1\)/)).toBeEnabled();
    });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConceptEditor, type ConceptPayload } from "@/components/admin/concept-editor";
import { MICRO_CONCEPTS } from "@/lib/curriculum";

function renderEditor(onSave = vi.fn().mockResolvedValue(true)) {
    render(<ConceptEditor concepts={MICRO_CONCEPTS} editing={null} onSave={onSave} onUploadImage={vi.fn()} onClear={vi.fn()} />);
    return onSave;
}

const input = (label: RegExp) => screen.getByLabelText(label, { selector: "input, textarea" }) as HTMLInputElement;

describe("ConceptEditor auto-fill", () => {
    it("generates the micro tag from the title as the admin types", () => {
        renderEditor();
        expect(screen.getByText("Type a title")).toBeInTheDocument();
        fireEvent.change(input(/^Title \(English\)/), { target: { value: "Prime Factorisation" } });
        expect(screen.getByText("c6-prime-factorisation")).toBeInTheDocument();
    });

    it("places a new concept at the end of the first topic, after its last concept", async () => {
        const onSave = renderEditor();
        fireEvent.change(input(/^Title \(English\)/), { target: { value: "Absolute Value" } });
        fireEvent.change(input(/^Summary \(English\)/), { target: { value: "Distance from zero, always positive." } });
        fireEvent.click(screen.getByRole("button", { name: /Save concept/ }));

        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const payload = onSave.mock.calls[0][0] as ConceptPayload;
        expect(payload.microTag).toBe("c6-absolute-value");
        expect(payload.topicId).toBe("class6-algebra-intro");
        expect(payload.order).toBe(7);
        expect(payload.prerequisiteTag).toBe("c6-algebra-word-problems");
        expect(payload.family).toBe("algebra");
        expect(payload.visualKind).toBe("expression");
        expect(payload.isNew).toBe(true);
        expect(payload.status).toBe("draft");
    });

    it("fills missing Roman Urdu with the English on save", async () => {
        const onSave = renderEditor();
        fireEvent.change(input(/^Title \(English\)/), { target: { value: "Absolute Value" } });
        fireEvent.change(input(/^Summary \(English\)/), { target: { value: "Distance from zero." } });
        fireEvent.click(screen.getByRole("button", { name: /Save concept/ }));

        await waitFor(() => expect(onSave).toHaveBeenCalled());
        const payload = onSave.mock.calls[0][0] as ConceptPayload;
        expect(payload.title).toEqual({ english: "Absolute Value", romanUrdu: "Absolute Value" });
        expect(payload.concept.romanUrdu).toBe("Distance from zero.");
    });

    it("will not save until a title and summary are given", () => {
        const onSave = renderEditor();
        expect(screen.getByRole("button", { name: /Save concept/ })).toBeDisabled();
        expect(screen.getByText(/Still needed: a title, a summary/)).toBeInTheDocument();
        expect(onSave).not.toHaveBeenCalled();
    });

    it("locks the micro tag when editing an existing concept", () => {
        const existing = MICRO_CONCEPTS.find((concept) => concept.microTag === "c7-coefficients")!;
        render(<ConceptEditor concepts={MICRO_CONCEPTS} editing={existing} onSave={vi.fn()} onUploadImage={vi.fn()} onClear={vi.fn()} />);
        fireEvent.change(input(/^Title \(English\)/), { target: { value: "Something Else Entirely" } });
        expect(screen.getByText("c7-coefficients")).toBeInTheDocument();
        expect(screen.getAllByText("Locked").length).toBeGreaterThan(0);
    });
});

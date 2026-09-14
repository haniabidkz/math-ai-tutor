import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BilingualText } from "@/components/bilingual-text";

describe("BilingualText", () => {
    const text = { english: "Move 5 steps right.", romanUrdu: "5 qadam daen jayein." };

    it("shows English by default with Roman Urdu hidden", () => {
        render(<BilingualText text={text} />);
        expect(screen.getByText("Move 5 steps right.")).toBeInTheDocument();
        expect(screen.queryByText("5 qadam daen jayein.")).not.toBeInTheDocument();
    });

    it("reveals the Roman Urdu under the English on request, and hides it again", () => {
        render(<BilingualText text={text} />);
        fireEvent.click(screen.getByRole("button", { name: "Roman Urdu" }));
        expect(screen.getByText("Move 5 steps right.")).toBeInTheDocument();
        expect(screen.getByText("5 qadam daen jayein.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "Hide Roman Urdu" }));
        expect(screen.queryByText("5 qadam daen jayein.")).not.toBeInTheDocument();
    });

    it("offers no button when there is no separate translation", () => {
        render(<BilingualText text={{ english: "42", romanUrdu: "42" }} />);
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("returns to English when the text changes", () => {
        const { rerender } = render(<BilingualText text={text} />);
        fireEvent.click(screen.getByRole("button", { name: "Roman Urdu" }));
        rerender(<BilingualText text={{ english: "Next hint.", romanUrdu: "Agla ishara." }} />);
        expect(screen.queryByText("Agla ishara.")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Roman Urdu" })).toBeInTheDocument();
    });
});

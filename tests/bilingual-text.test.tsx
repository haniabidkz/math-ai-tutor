import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { BilingualText } from "@/components/bilingual-text";

describe("BilingualText", () => {
    const text = { english: "Move 5 steps right.", romanUrdu: "5 qadam daen jayein." };
    const next = { english: "Next hint.", romanUrdu: "Agla ishara." };

    beforeEach(() => { window.sessionStorage.clear(); });

    it("asks which language to read in before the first aid is shown", () => {
        render(<BilingualText text={text} prompt="Read the hint in" />);
        expect(screen.getByRole("group", { name: "Read the hint in" })).toBeInTheDocument();
        expect(screen.queryByText("Move 5 steps right.")).not.toBeInTheDocument();
        expect(screen.queryByText("5 qadam daen jayein.")).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Roman Urdu" }));
        expect(screen.getByText("5 qadam daen jayein.")).toBeInTheDocument();
        expect(screen.queryByText("Move 5 steps right.")).not.toBeInTheDocument();
    });

    it("remembers the choice for the session and applies it to every aid at once", () => {
        render(<><BilingualText text={text} /><BilingualText text={next} /></>);
        fireEvent.click(screen.getAllByRole("button", { name: "English" })[0]);
        expect(screen.getByText("Move 5 steps right.")).toBeInTheDocument();
        expect(screen.getByText("Next hint.")).toBeInTheDocument();

        // A later aid in the same session renders straight away, in the chosen language.
        const { unmount } = render(<BilingualText text={{ english: "Later.", romanUrdu: "Baad mein." }} />);
        expect(screen.getByText("Later.")).toBeInTheDocument();
        unmount();
    });

    it("switches every aid when the student changes language", () => {
        window.sessionStorage.setItem("learningAidLanguage", "english");
        render(<><BilingualText text={text} /><BilingualText text={next} /></>);
        fireEvent.click(screen.getAllByRole("button", { name: "Read in Roman Urdu" })[0]);
        expect(screen.getByText("5 qadam daen jayein.")).toBeInTheDocument();
        expect(screen.getByText("Agla ishara.")).toBeInTheDocument();
        expect(window.sessionStorage.getItem("learningAidLanguage")).toBe("roman-urdu");
    });

    it("shows English only, with no choice, when there is no separate translation", () => {
        render(<BilingualText text={{ english: "42", romanUrdu: "42" }} />);
        expect(screen.getByText("42")).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
});

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PiMascot, PiSays } from "@/components/student/pi-mascot";
import { ComboChip, DifficultyLadder, LanguageSwitch, OptionTile, QuestionPath } from "@/components/student/quiz-hud";

describe("quiz game HUD", () => {
    it("draws the quiz as a path with right, wrong, current and upcoming stops", () => {
        render(<QuestionPath total={5} current={3} results={[true, false]} />);
        const list = screen.getByRole("list", { name: "Question 3 of 5" });
        const stops = list.querySelectorAll("li > span:first-child");
        expect(stops).toHaveLength(5);
        expect(stops[0].className).toContain("bg-emerald-600");
        expect(stops[1].className).toContain("bg-rose-500");
        expect(stops[2].getAttribute("aria-current")).toBe("step");
        expect(stops[4].className).toContain("bg-white");
    });

    it("lights the current level and says when the student climbed", () => {
        const { rerender } = render(<DifficultyLadder current="medium" trend="up" />);
        expect(screen.getByText("Level up!")).toBeInTheDocument();
        expect(screen.getByLabelText("Level: Medium")).toBeInTheDocument();
        rerender(<DifficultyLadder current="easy" trend="down" />);
        expect(screen.getByText("A little easier, then up again")).toBeInTheDocument();
        rerender(<DifficultyLadder current="hard" trend={null} />);
        expect(screen.queryByText("Level up!")).not.toBeInTheDocument();
    });

    it("shows the combo only once two answers in a row are right", () => {
        const { rerender } = render(<ComboChip combo={1} />);
        expect(screen.getByLabelText("Combo 1")).toHaveTextContent("Combo");
        rerender(<ComboChip combo={3} />);
        expect(screen.getByLabelText("Combo 3")).toHaveTextContent("x3");
    });

    it("marks the chosen option and switches the aid language", () => {
        const pick = vi.fn();
        const choose = vi.fn();
        render(<><OptionTile letter="B" text="Juice" selected={false} onClick={pick} /><LanguageSwitch value="english" onChange={choose} /></>);
        fireEvent.click(screen.getByRole("button", { name: /Juice/ }));
        expect(pick).toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(screen.getByRole("button", { name: "RU" }));
        expect(choose).toHaveBeenCalledWith("roman-urdu");
    });

    it("renders Pi in every mood with a speech bubble", () => {
        render(<PiSays mood="cheer">Shabash!</PiSays>);
        expect(screen.getByText("Shabash!")).toBeInTheDocument();
        const { container } = render(<><PiMascot mood="think" /><PiMascot mood="oops" /><PiMascot mood="happy" /></>);
        expect(container.querySelectorAll("svg")).toHaveLength(3);
    });
});

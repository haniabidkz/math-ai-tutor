import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LessonPractice } from "@/components/student/lesson-practice";
import type { LessonPracticeItem } from "@/lib/lesson-steps";

const item: LessonPracticeItem = {
    id: "q1",
    difficulty: "easy",
    question: { english: "Which is a set?", romanUrdu: "Set kaun sa hai?" },
    options: [
        { id: "A", english: "{1, 2}", romanUrdu: "{1, 2}" },
        { id: "B", english: "(1, 2)", romanUrdu: "(1, 2)" },
        { id: "C", english: "[1, 2]", romanUrdu: "[1, 2]" },
        { id: "D", english: "1, 2", romanUrdu: "1, 2" },
    ],
    correctOptionId: "A",
    hint: { english: "Look at the brackets.", romanUrdu: "Brackets dekho." },
    explanation: { english: "Sets use curly brackets.", romanUrdu: "Set curly brackets mein likhte hain." },
    whyWrong: { B: { english: "Round brackets are for pairs.", romanUrdu: "Round brackets pair ke liye hain." } },
};

describe("LessonPractice", () => {
    it("explains a wrong pick, lets the student retry, and opens the next step on a right one", () => {
        const onResult = vi.fn();
        render(<LessonPractice item={item} language="english" eyebrow="Try it" onResult={onResult}><button type="button">Next</button></LessonPractice>);
        const check = screen.getByRole("button", { name: /Check/ });
        expect(check).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: /\(1, 2\)/ }));
        fireEvent.click(check);
        expect(screen.getByText("Round brackets are for pairs.")).toBeInTheDocument();
        expect(onResult).toHaveBeenLastCalledWith(false);
        expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
        fireEvent.click(screen.getByRole("button", { name: /\{1, 2\}/ }));
        fireEvent.click(screen.getByRole("button", { name: /Check/ }));
        expect(screen.getByText("Sets use curly brackets.")).toBeInTheDocument();
        expect(onResult).toHaveBeenLastCalledWith(true);
        expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    });

    it("reads in Roman Urdu when that is the chosen language", () => {
        render(<LessonPractice item={item} language="roman-urdu" eyebrow="Khud karo" />);
        expect(screen.getByText("Set kaun sa hai?")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /Check karo/ })).toBeInTheDocument();
    });
});

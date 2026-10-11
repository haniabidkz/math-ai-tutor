import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MistakeBox } from "@/components/student/mistake-box";
import { storeAidLanguage } from "@/lib/aid-language";

const text = (english: string, romanUrdu = english) => ({ english, romanUrdu });

const props = {
    mistake: { type: "concept" as const, tag: "arithmetic-slip" as const, label: "Calculation slip", whyWrong: text("Sets use curly brackets { }, not round brackets.", "Set curly brackets { } mein likhte hain, round nahi.") },
    answer: { selected: { id: "A", text: "(green, white)" }, correct: { id: "C", text: "{green, white}" } },
    explanation: text("The colors are green and white, and set elements are written inside curly brackets."),
    concept: text("A set is a well-defined collection of objects. Its things are called elements.", "Set cheezon ka saaf majmua hai. Is ki cheezein elements kehlati hain."),
};

describe("MistakeBox", () => {
    beforeEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

    it("shows the pick, the reason, the correct answer, its working and one line to remember, each once", () => {
        render(<MistakeBox language="english" {...props} />);
        expect(screen.getByRole("heading", { name: "Common mistake" })).toBeInTheDocument();
        expect(screen.getByText(/A\. \(green, white\)/)).toBeInTheDocument();
        expect(screen.getByText("Sets use curly brackets { }, not round brackets.")).toBeInTheDocument();
        expect(screen.getByText(/C\. \{green, white\}/)).toBeInTheDocument();
        expect(screen.getByText(/elements are written inside curly brackets/)).toBeInTheDocument();
        expect(screen.getByText("A set is a well-defined collection of objects.")).toBeInTheDocument();
        expect(screen.getAllByRole("heading")).toHaveLength(1);
        // The full idea waits behind a tap.
        expect(screen.queryByText(/Its things are called elements/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: /Read the full idea/ }));
        expect(screen.getByText(/Its things are called elements/)).toBeInTheDocument();
    });

    it("reads in Roman Urdu and keeps the generic tip only for a matching topic", () => {
        // Bilingual blocks follow the stored choice, as they do on the real screen.
        storeAidLanguage("roman-urdu");
        render(<MistakeBox language="roman-urdu" {...props}
            misconception={{ type: "concept", tag: "incomplete-inverse-operation", microTag: "c6-defination-of-sets", guidance: text("Undo on both sides.", "Dono taraf ulta karo.") }} />);
        expect(screen.getByText("Set curly brackets { } mein likhte hain, round nahi.")).toBeInTheDocument();
        expect(screen.getByText("Yeh ghalti baar baar ho rahi hai")).toBeInTheDocument();
        expect(screen.queryByText("Dono taraf ulta karo.")).not.toBeInTheDocument();
        expect(screen.getByText(/Tumhara jawab/)).toBeInTheDocument();
    });

    it("still works with only a reason, for practice questions", () => {
        render(<MistakeBox language="english" mistake={props.mistake} />);
        expect(screen.getByText("Sets use curly brackets { }, not round brackets.")).toBeInTheDocument();
        expect(screen.queryByText(/Correct answer/)).not.toBeInTheDocument();
    });
});

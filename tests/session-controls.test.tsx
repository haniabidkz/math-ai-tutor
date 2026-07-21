import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionControls } from "@/components/session-controls";

describe("SessionControls", () => {
    it("renders stable language and difficulty controls", () => {
        render(React.createElement(SessionControls, { locale: "english", onLocaleChange: vi.fn(), difficulty: "medium", onDifficultyChange: vi.fn() }));
        expect(screen.getByRole("combobox", { name: "Language" })).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Difficulty" })).toBeInTheDocument();
    });
});

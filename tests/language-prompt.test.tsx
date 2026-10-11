import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LanguagePrompt } from "@/components/student/language-prompt";
import { readAidLanguage, storeAidLanguage } from "@/lib/aid-language";

describe("language choice", () => {
    beforeEach(() => {
        window.localStorage.clear();
        window.sessionStorage.clear();
    });

    it("offers Roman Urdu and English once and reports the pick", () => {
        const onChoose = vi.fn();
        render(<LanguagePrompt onChoose={onChoose} />);
        fireEvent.click(screen.getByRole("button", { name: /Roman Urdu/ }));
        expect(onChoose).toHaveBeenCalledWith("roman-urdu");
        fireEvent.click(screen.getByRole("button", { name: /^English/ }));
        expect(onChoose).toHaveBeenCalledWith("english");
    });

    it("keeps the choice on the device, not only for the tab", () => {
        expect(readAidLanguage()).toBeNull();
        storeAidLanguage("roman-urdu");
        expect(window.localStorage.getItem("learningAidLanguage")).toBe("roman-urdu");
        window.sessionStorage.clear();
        expect(readAidLanguage()).toBe("roman-urdu");
    });
});

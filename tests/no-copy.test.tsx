import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NoCopy } from "@/components/student/no-copy";

describe("NoCopy", () => {
    it("renders its children unselectable and blocks copy, context menu and the copy hotkey", () => {
        render(<NoCopy className="extra"><p>Which collection is a set?</p></NoCopy>);
        const wrapper = screen.getByText("Which collection is a set?").parentElement!;
        expect(wrapper.className).toContain("select-none");
        expect(wrapper.className).toContain("extra");

        const copy = new Event("copy", { bubbles: true, cancelable: true });
        document.dispatchEvent(copy);
        expect(copy.defaultPrevented).toBe(true);

        const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
        document.dispatchEvent(menu);
        expect(menu.defaultPrevented).toBe(true);

        const hotkey = new KeyboardEvent("keydown", { key: "c", ctrlKey: true, bubbles: true, cancelable: true });
        document.dispatchEvent(hotkey);
        expect(hotkey.defaultPrevented).toBe(true);

        const typing = new KeyboardEvent("keydown", { key: "c", bubbles: true, cancelable: true });
        document.dispatchEvent(typing);
        expect(typing.defaultPrevented).toBe(false);
        fireEvent.click(screen.getByText("Which collection is a set?"));
    });
});

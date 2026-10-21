"use client";

import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Keeps quiz material on the screen: no text selection, no right-click menu, no copy, cut or
 * drag, and the copy hotkeys do nothing while the page is open. Buttons and inputs still work.
 */
export function NoCopy({ children, className }: { children: ReactNode; className?: string }) {
    useEffect(() => {
        const block = (event: Event) => event.preventDefault();
        const blockKeys = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && (key === "c" || key === "x" || key === "a" || key === "s" || key === "p")) event.preventDefault();
        };
        document.addEventListener("copy", block);
        document.addEventListener("cut", block);
        document.addEventListener("contextmenu", block);
        document.addEventListener("dragstart", block);
        document.addEventListener("keydown", blockKeys);
        return () => {
            document.removeEventListener("copy", block);
            document.removeEventListener("cut", block);
            document.removeEventListener("contextmenu", block);
            document.removeEventListener("dragstart", block);
            document.removeEventListener("keydown", blockKeys);
        };
    }, []);

    return (
        <div className={cn("select-none", className)} style={{ WebkitUserSelect: "none", WebkitTouchCallout: "none" } as React.CSSProperties}>
            {children}
        </div>
    );
}

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PiMood = "happy" | "think" | "cheer" | "oops";

/**
 * Pi, the tutor's mascot: a small friendly face that reacts to what the student does. Drawn
 * inline so it costs nothing to load and works offline.
 */
export function PiMascot({ mood = "happy", size = 56, className }: { mood?: PiMood; size?: number; className?: string }) {
    const eyes = mood === "cheer"
        ? <><path d="M16 29q4-5 8 0" stroke="#1F2544" strokeWidth="3" fill="none" strokeLinecap="round" /><path d="M32 29q4-5 8 0" stroke="#1F2544" strokeWidth="3" fill="none" strokeLinecap="round" /></>
        : mood === "think"
            ? <><circle cx="20" cy="29" r="3.5" fill="#1F2544" /><circle cx="36" cy="29" r="3.5" fill="#1F2544" /><path d="M14 20q6-4 12 0" stroke="#1F2544" strokeWidth="2.5" fill="none" strokeLinecap="round" /></>
            : <><circle cx="20" cy="29" r="3.5" fill="#1F2544" /><circle cx="36" cy="29" r="3.5" fill="#1F2544" /></>;
    const mouth = mood === "cheer"
        ? <path d="M18 37q10 11 20 0" stroke="#1F2544" strokeWidth="3" fill="none" strokeLinecap="round" />
        : mood === "oops"
            ? <path d="M19 40q9-6 18 0" stroke="#1F2544" strokeWidth="3" fill="none" strokeLinecap="round" />
            : mood === "think"
                ? <path d="M21 39h14" stroke="#1F2544" strokeWidth="3" fill="none" strokeLinecap="round" />
                : <path d="M19 38q9 8 18 0" stroke="#1F2544" strokeWidth="3" fill="none" strokeLinecap="round" />;
    return (
        <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden="true" className={cn("shrink-0", className)}>
            <circle cx="28" cy="31" r="22" fill="#FFD166" />
            {eyes}
            {mouth}
            <line x1="28" y1="9" x2="28" y2="3" stroke="#1F2544" strokeWidth="3" strokeLinecap="round" />
            <circle cx="28" cy="3" r="3" fill="#4F46E5" />
        </svg>
    );
}

/** Pi with a speech bubble. */
export function PiSays({ mood, children, className }: { mood?: PiMood; children: ReactNode; className?: string }) {
    return (
        <div className={cn("flex items-start gap-3", className)}>
            <PiMascot mood={mood} size={52} />
            <div className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[15px] font-bold leading-relaxed text-slate-800">{children}</div>
        </div>
    );
}

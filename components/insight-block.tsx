import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
    wrong: "border-rose-200 border-l-rose-500 bg-rose-50 text-rose-950",
    repeat: "border-amber-200 border-l-amber-500 bg-amber-50 text-amber-950",
    explain: "border-sky-200 border-l-sky-500 bg-sky-50 text-sky-950",
    hint: "border-yellow-200 border-l-yellow-500 bg-yellow-50 text-yellow-950",
    correct: "border-emerald-200 border-l-emerald-500 bg-emerald-50 text-emerald-950",
    concept: "border-indigo-200 border-l-indigo-500 bg-indigo-50/60 text-slate-900",
} as const;

/**
 * A feedback container students read on a phone as easily as on a laptop: one colour per
 * kind of insight, a bold label, and large, well-spaced text that wraps inside the box.
 */
export function InsightBlock({ tone, icon, title, children, className }: {
    tone: keyof typeof TONES;
    icon?: ReactNode;
    title: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    return (
        <section className={cn("rounded-xl border border-l-4 p-4 shadow-sm md:p-5", TONES[tone], className)}>
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-bold uppercase tracking-wide">{icon}{title}</h3>
            {children ? <div className="mt-2 break-words text-base leading-8 md:text-lg">{children}</div> : null}
        </section>
    );
}

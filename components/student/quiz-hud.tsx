"use client";

import { Check, ChevronRight, Flame, Star, TrendingDown, TrendingUp, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Difficulty } from "@/types/curriculum";

/** Which questions of the quiz are done and how they went; null is an answer the server has not scored yet (offline). */
export type PathResult = boolean | null;

/**
 * The quiz as a path of numbered stops rather than a bar: green for a right answer, rose for a
 * wrong one, indigo for where the student is now.
 */
export function QuestionPath({ total, current, results, className }: { total: number; current: number; results: PathResult[]; className?: string }) {
    const stops = Array.from({ length: Math.max(1, total) }, (_, index) => index + 1);
    return (
        <ol className={cn("flex flex-wrap items-center justify-center", className)} aria-label={`Question ${current} of ${total}`}>
            {stops.map((n) => {
                const result = results[n - 1];
                const done = n < current || (n === current && result !== undefined);
                const isCurrent = n === current && result === undefined;
                const fill = done
                    ? result === false ? "border-rose-500 bg-rose-500 text-white" : result === null ? "border-slate-400 bg-slate-400 text-white" : "border-emerald-600 bg-emerald-600 text-white"
                    : isCurrent ? "border-indigo-200 bg-indigo-600 text-white ring-4 ring-indigo-100" : "border-slate-200 bg-white text-slate-400";
                return (
                    <li key={n} className="flex items-center">
                        <span aria-current={isCurrent ? "step" : undefined} className={cn("flex h-6 w-6 items-center justify-center rounded-full border-[3px] text-[10px] font-extrabold sm:h-7 sm:w-7 sm:text-[11px]", fill)}>
                            {done && result !== false && result !== null ? <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" strokeWidth={3} /> : n}
                        </span>
                        {n < total ? <span className={cn("h-1 w-1.5 sm:w-3", done ? "bg-emerald-600" : "bg-slate-200")} /> : null}
                    </li>
                );
            })}
        </ol>
    );
}

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];
const LEVEL_LABELS: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** Easy → Medium → Hard, with the current level lit and a word about the last move. */
export function DifficultyLadder({ current, trend, className }: { current: Difficulty; trend: "up" | "down" | null; className?: string }) {
    const index = LEVELS.indexOf(current);
    return (
        <div className={cn("flex flex-wrap items-center justify-between gap-2", className)}>
            <div className="flex items-center gap-1" aria-label={`Level: ${LEVEL_LABELS[current]}`}>
                {LEVELS.map((level, position) => (
                    <span key={level} className="flex items-center gap-1">
                        <span className={cn(
                            "rounded-xl px-2.5 py-1.5 text-xs font-extrabold",
                            position < index ? "bg-emerald-100 text-emerald-800" : position === index ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500",
                        )}>
                            {position < index ? <Check className="mr-1 inline h-3 w-3" strokeWidth={3} /> : null}{LEVEL_LABELS[level]}
                        </span>
                        {position < LEVELS.length - 1 ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : null}
                    </span>
                ))}
            </div>
            {trend === "up" ? (
                <span className="flex items-center gap-1 rounded-xl bg-amber-100 px-2.5 py-1.5 text-xs font-extrabold text-amber-900"><TrendingUp className="h-3.5 w-3.5" />Level up!</span>
            ) : trend === "down" ? (
                <span className="flex items-center gap-1 rounded-xl bg-sky-100 px-2.5 py-1.5 text-xs font-extrabold text-sky-900"><TrendingDown className="h-3.5 w-3.5" />A little easier, then up again</span>
            ) : null}
        </div>
    );
}

/** Correct answers in a row. */
export function ComboChip({ combo, className }: { combo: number; className?: string }) {
    const lit = Math.min(combo, 5);
    return (
        <span className={cn("flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-extrabold", combo >= 2 ? "bg-amber-200 text-amber-900" : "bg-slate-100 text-slate-500", className)} aria-label={`Combo ${combo}`}>
            <span className="flex gap-0.5">
                {Array.from({ length: 5 }, (_, index) => (
                    <span key={index} className={cn("h-3.5 w-1.5 rounded-sm", index < lit ? (combo >= 2 ? "bg-amber-800" : "bg-slate-400") : "bg-white")} />
                ))}
            </span>
            {combo >= 2 ? <><Zap className="h-4 w-4" />x{combo}</> : "Combo"}
        </span>
    );
}

export function ScoreChip({ score, className }: { score: number; className?: string }) {
    return (
        <span className={cn("flex items-center gap-1.5 rounded-2xl bg-indigo-100 px-3 py-2 text-sm font-extrabold text-indigo-900", className)}>
            <Star className="h-4 w-4" />{score}
        </span>
    );
}

export function StreakChip({ days, className }: { days: number; className?: string }) {
    return (
        <span className={cn("flex items-center gap-1.5 rounded-2xl bg-orange-100 px-3 py-2 text-sm font-extrabold text-orange-900", className)}>
            <Flame className="h-4 w-4" />{days}
        </span>
    );
}

/** A large, friendly multiple-choice option. */
export function OptionTile({ letter, text, selected, disabled, onClick }: { letter: string; text: string; selected: boolean; disabled?: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-pressed={selected}
            className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-base font-bold leading-snug transition disabled:opacity-60 md:text-lg",
                selected ? "border-indigo-600 bg-indigo-50 text-slate-900" : "border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50/40",
            )}
        >
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-extrabold", selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600")}>{letter}</span>
            <span className="break-words">{text}</span>
        </button>
    );
}

/** The student's own tally during the quiz. */
export function QuizStats({ right, wrong, hints, className }: { right: number; wrong: number; hints: number; className?: string }) {
    return (
        <dl className={cn("grid grid-cols-3 gap-2 text-center", className)}>
            <div className="rounded-2xl bg-white p-3"><dt className="text-[11px] font-extrabold uppercase text-slate-500">Right</dt><dd className="font-display text-2xl font-bold text-emerald-700">{right}</dd></div>
            <div className="rounded-2xl bg-white p-3"><dt className="text-[11px] font-extrabold uppercase text-slate-500">Wrong</dt><dd className="font-display text-2xl font-bold text-rose-700">{wrong}</dd></div>
            <div className="rounded-2xl bg-white p-3"><dt className="text-[11px] font-extrabold uppercase text-slate-500">Hints</dt><dd className="font-display text-2xl font-bold text-amber-700">{hints}</dd></div>
        </dl>
    );
}

/** A segmented English / Roman Urdu switch for every learning aid on the screen. */
export function LanguageSwitch({ value, onChange, className }: { value: "english" | "roman-urdu" | null; onChange: (value: "english" | "roman-urdu") => void; className?: string }) {
    const item = (key: "english" | "roman-urdu", label: string) => (
        <button type="button" onClick={() => onChange(key)} aria-pressed={value === key}
            className={cn("h-9 px-3 text-xs font-extrabold transition", value === key ? "bg-indigo-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50")}>
            {label}
        </button>
    );
    return (
        <div role="group" aria-label="Language for hints and explanations" className={cn("flex overflow-hidden rounded-xl border border-slate-200", className)}>
            {item("roman-urdu", "RU")}{item("english", "EN")}
        </div>
    );
}

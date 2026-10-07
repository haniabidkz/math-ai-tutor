"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import { BilingualText } from "@/components/bilingual-text";
import { InsightBlock } from "@/components/insight-block";
import { OptionTile } from "@/components/student/quiz-hud";
import { Button } from "@/components/ui/button";
import type { AidLanguage } from "@/lib/aid-language";
import type { LessonPracticeItem, OptionId } from "@/lib/lesson-steps";

/**
 * One practice question inside a lesson. The answer is checked on the device and nothing is
 * scored or saved; a wrong pick shows why and lets the student try again.
 */
export function LessonPractice({ item, language, eyebrow, note, onResult, children }: {
    item: LessonPracticeItem;
    language: AidLanguage | null;
    /** Small label above the question, e.g. "Khud karo". */
    eyebrow: ReactNode;
    /** A line under the question, e.g. "Not scored". */
    note?: ReactNode;
    onResult?: (correct: boolean) => void;
    /** Shown once the answer is right, e.g. the button to the next step. */
    children?: ReactNode;
}) {
    const [selected, setSelected] = useState<OptionId | "">("");
    const [checked, setChecked] = useState<OptionId | null>(null);
    const ru = language === "roman-urdu";
    const text = (value: { english: string; romanUrdu: string }) => (ru && value.romanUrdu ? value.romanUrdu : value.english);
    const correct = checked !== null && checked === item.correctOptionId;
    const wrongReason = checked && checked !== item.correctOptionId ? item.whyWrong[checked] : undefined;

    function check() {
        if (!selected) return;
        setChecked(selected);
        onResult?.(selected === item.correctOptionId);
    }

    function tryAgain() {
        setChecked(null);
        setSelected("");
    }

    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-xl bg-indigo-50 px-2.5 py-1 text-xs font-extrabold uppercase text-indigo-800">{eyebrow}</span>
                {note ? <span className="text-xs font-bold text-slate-500">{note}</span> : null}
            </div>
            <h2 className="mt-3 break-words font-display text-2xl font-semibold leading-snug md:text-3xl md:leading-snug" lang={ru ? "ur-Latn" : undefined}>{text(item.question)}</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
                {item.options.map((option) => (
                    <OptionTile key={option.id} letter={option.id} text={text(option)} selected={selected === option.id} disabled={checked !== null && correct} onClick={() => { setSelected(option.id); if (checked) setChecked(null); }} />
                ))}
            </div>
            {checked ? (
                correct ? (
                    <InsightBlock tone="correct" className="mt-4" icon={<CheckCircle2 className="h-4 w-4" />} title={ru ? "Sahi!" : "Correct!"}>
                        <BilingualText text={item.explanation} switcher={false} />
                    </InsightBlock>
                ) : (
                    <InsightBlock tone="wrong" className="mt-4" icon={<XCircle className="h-4 w-4" />} title={ru ? "Abhi nahi" : "Not yet"}>
                        {wrongReason ? <BilingualText text={wrongReason} switcher={false} /> : <BilingualText text={item.hint} switcher={false} />}
                        <Button type="button" variant="outline" size="sm" className="mt-3 font-bold" onClick={tryAgain}><RotateCcw className="mr-2 h-4 w-4" />{ru ? "Dobara koshish" : "Try again"}</Button>
                    </InsightBlock>
                )
            ) : null}
            {!checked ? (
                <div className="mt-6 flex flex-wrap items-center gap-3">
                    <Button type="button" size="lg" className="h-14 flex-1 rounded-2xl text-base font-extrabold" onClick={check} disabled={!selected}>
                        {ru ? "Check karo" : "Check"}<CheckCircle2 className="ml-2 h-5 w-5" />
                    </Button>
                    <span className="flex items-center gap-1 text-xs font-bold text-slate-500"><Lightbulb className="h-3.5 w-3.5" />{ru ? "Ghalat ho to wajah dikhegi" : "A wrong pick shows why"}</span>
                </div>
            ) : correct ? <div className="mt-6">{children}</div> : null}
        </div>
    );
}

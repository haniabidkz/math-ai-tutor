"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Layers, Lightbulb, XCircle } from "lucide-react";
import { BilingualText } from "@/components/bilingual-text";
import type { AidLanguage } from "@/lib/aid-language";
import { keyIdea, splitSteps } from "@/lib/lesson-steps";
import { MISTAKE_TYPE_LABELS, misconceptionFitsTopic } from "@/lib/mistake-analysis";
import { cn } from "@/lib/utils";
import type { MistakePayload } from "@/types/assessment";
import type { LocalizedText, MisconceptionTag, MistakeType } from "@/types/curriculum";

export interface AnswerInfo {
    selected: { id: string; text: string };
    correct: { id: string; text: string };
}

const pick = (language: AidLanguage | null, text: LocalizedText) => (language === "roman-urdu" && text.romanUrdu ? text.romanUrdu : text.english);

/**
 * A wrong answer explained in three flat cards: the student's pick with the reason (red), the
 * correct answer with its steps (green), and one line to remember (yellow). No outer box, no
 * repeated headings.
 */
export function MistakeBox({ language, mistake, answer, explanation, concept, misconception, foundation, classLevel, className }: {
    language: AidLanguage | null;
    mistake?: MistakePayload | null;
    answer?: AnswerInfo | null;
    explanation?: LocalizedText | null;
    /** The lesson's explanation; its first sentence is the line to remember, the rest can be opened. */
    concept?: LocalizedText | null;
    misconception?: { type: MistakeType; tag: MisconceptionTag; microTag: string; guidance: LocalizedText } | null;
    foundation?: { classLevel: number; title: LocalizedText; total: number; passMark: number } | null;
    classLevel?: number;
    className?: string;
}) {
    const [fullIdea, setFullIdea] = useState(false);
    const ru = language === "roman-urdu";
    const say = (english: string, romanUrdu: string) => (ru ? romanUrdu : english);
    const lang = ru ? "ur-Latn" : undefined;
    const remember = concept ? keyIdea(concept) : null;
    const showFullIdea = Boolean(concept && remember && concept.english.trim() !== remember.english.trim());
    const steps = explanation ? splitSteps(pick(language, explanation)) : [];

    return (
        <div className={cn("space-y-3", className)}>
            <div className="flex flex-wrap items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-700">{say("Common mistake", "Aam ghalti")}</h2>
                {mistake ? <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-bold text-slate-600">{MISTAKE_TYPE_LABELS[mistake.type].english}</span> : null}
            </div>

            {answer || mistake ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 md:p-5">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-red-700">{say("Your answer", "Tumhara jawab")}</p>
                    {answer ? <p className="mt-1 text-lg font-bold text-red-900">{answer.selected.id}. {answer.selected.text}</p> : null}
                    {mistake ? <p className="mt-1 text-base leading-7 text-red-950" lang={lang}>{pick(language, mistake.whyWrong)}</p> : null}
                </div>
            ) : null}

            {answer || steps.length ? (
                <div className="rounded-2xl border border-green-200 bg-green-50 p-4 md:p-5">
                    <p className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-green-700"><CheckCircle2 className="h-3.5 w-3.5" />{say("Correct answer", "Sahi jawab")}</p>
                    {answer ? <p className="mt-1 text-lg font-bold text-green-900">{answer.correct.id}. {answer.correct.text}</p> : null}
                    {steps.length > 1 ? (
                        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-base leading-7 text-green-950" lang={lang}>
                            {steps.map((step, index) => <li key={index}>{step}</li>)}
                        </ol>
                    ) : steps.length === 1 ? <p className="mt-1 text-base leading-7 text-green-950" lang={lang}>{steps[0]}</p> : null}
                </div>
            ) : null}

            {remember ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 md:p-5">
                    <p className="flex items-center gap-1 text-xs font-extrabold uppercase tracking-wide text-amber-800"><Lightbulb className="h-3.5 w-3.5" />{say("Remember", "Yaad rakho")}</p>
                    <p className="mt-1 text-base font-bold leading-7 text-amber-950" lang={lang}>{pick(language, remember)}</p>
                    {showFullIdea ? (
                        <>
                            <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-amber-800 underline-offset-2 hover:underline" onClick={() => setFullIdea((open) => !open)} aria-expanded={fullIdea}>
                                {fullIdea ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{fullIdea ? say("Hide the full idea", "Poora idea chhupao") : say("Read the full idea", "Poora idea parho")}
                            </button>
                            {fullIdea ? <BilingualText text={concept!} switcher={false} className="mt-2" /> : null}
                        </>
                    ) : null}
                </div>
            ) : null}

            {misconception ? (
                <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950">
                    <p className="flex items-center gap-1 font-extrabold"><AlertTriangle className="h-4 w-4" />{say("This mistake keeps coming back", "Yeh ghalti baar baar ho rahi hai")}</p>
                    <p className="mt-1">{say("A short set of practice questions comes next, so it stops here.", "Ab chand practice sawal aayenge, taake yeh yahin ruk jaye.")}</p>
                    {misconceptionFitsTopic(misconception.tag, misconception.microTag) ? <p className="mt-1 font-medium" lang={lang}>{pick(language, misconception.guidance)}</p> : null}
                </div>
            ) : null}

            {foundation ? (
                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950">
                    <p className="flex items-center gap-1 font-extrabold"><Layers className="h-4 w-4" />{say(`First, a short round of Class ${foundation.classLevel} ${foundation.title.english}`, `Pehle Class ${foundation.classLevel} ${foundation.title.english} ka chhota round`)}</p>
                    <p className="mt-1">
                        {say(`Answer ${foundation.total} questions from there; get ${foundation.passMark} right and you come back to your Class ${classLevel ?? ""} questions. Your class and your score do not change.`,
                            `Wahan se ${foundation.total} sawal; ${foundation.passMark} sahi karo to apni Class ${classLevel ?? ""} ke sawalon par wapas. Tumhari class aur score nahi badalte.`)}
                    </p>
                </div>
            ) : null}
        </div>
    );
}

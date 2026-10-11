"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Layers, Lightbulb, XCircle } from "lucide-react";
import { BilingualText } from "@/components/bilingual-text";
import type { AidLanguage } from "@/lib/aid-language";
import { keyIdea } from "@/lib/lesson-steps";
import { MISTAKE_TYPE_LABELS, misconceptionFitsTopic } from "@/lib/mistake-analysis";
import { cn } from "@/lib/utils";
import type { MistakePayload } from "@/types/assessment";
import type { LocalizedText, MisconceptionTag, MistakeType } from "@/types/curriculum";

export interface AnswerInfo {
    selected: { id: string; text: string };
    correct: { id: string; text: string };
}

/**
 * Everything about a wrong answer in one box: the common mistake, the student's pick and why
 * it is wrong, the correct answer with its working, and one line to remember. Nothing is
 * repeated under a second heading.
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
    const remember = concept ? keyIdea(concept) : null;
    const showFullIdea = Boolean(concept && remember && concept.english.trim() !== remember.english.trim());

    return (
        <section className={cn("overflow-hidden rounded-2xl border border-rose-200 bg-white", className)}>
            <div className="flex flex-wrap items-center gap-2 border-b border-rose-100 bg-rose-50 px-4 py-3">
                <XCircle className="h-4 w-4 text-rose-600" />
                <h2 className="text-sm font-extrabold uppercase tracking-wide text-rose-800">{say("Common mistake", "Aam ghalti")}</h2>
                {mistake ? <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-rose-700">{MISTAKE_TYPE_LABELS[mistake.type].english}</span> : null}
            </div>
            <div className="space-y-4 p-4 md:p-5">
                {answer ? (
                    <div>
                        <p className="font-bold text-rose-700"><span className="text-xs font-extrabold uppercase">{say("Your answer", "Tumhara jawab")}:</span> {answer.selected.id}. {answer.selected.text}</p>
                        {mistake ? <BilingualText text={mistake.whyWrong} switcher={false} className="mt-1" /> : null}
                    </div>
                ) : mistake ? <BilingualText text={mistake.whyWrong} switcher={false} /> : null}

                {answer || explanation ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        {answer ? <p className="font-bold text-emerald-800"><CheckCircle2 className="mr-1 inline h-4 w-4" /><span className="text-xs font-extrabold uppercase">{say("Correct answer", "Sahi jawab")}:</span> {answer.correct.id}. {answer.correct.text}</p> : null}
                        {explanation ? <BilingualText text={explanation} switcher={false} className={answer ? "mt-1" : undefined} /> : null}
                    </div>
                ) : null}

                {remember ? (
                    <div className="rounded-xl bg-amber-50 p-3">
                        <p className="flex items-center gap-1 text-xs font-extrabold uppercase text-amber-800"><Lightbulb className="h-3.5 w-3.5" />{say("Remember", "Yaad rakho")}</p>
                        <p className="mt-1 text-base font-bold leading-7 text-amber-950" lang={ru ? "ur-Latn" : undefined}>{ru && remember.romanUrdu ? remember.romanUrdu : remember.english}</p>
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
                    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">
                        <p className="flex items-center gap-1 font-extrabold"><AlertTriangle className="h-4 w-4" />{say("This mistake keeps coming back", "Yeh ghalti baar baar ho rahi hai")}</p>
                        <p className="mt-1">{say("A short set of practice questions comes next, so it stops here.", "Ab chand practice sawal aayenge, taake yeh yahin ruk jaye.")}</p>
                        {misconceptionFitsTopic(misconception.tag, misconception.microTag) ? <BilingualText text={misconception.guidance} switcher={false} className="mt-1 font-medium" /> : null}
                    </div>
                ) : null}

                {foundation ? (
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
                        <p className="flex items-center gap-1 font-extrabold"><Layers className="h-4 w-4" />{say(`First, a short round of Class ${foundation.classLevel} ${foundation.title.english}`, `Pehle Class ${foundation.classLevel} ${foundation.title.english} ka chhota round`)}</p>
                        <p className="mt-1">
                            {say(`Answer ${foundation.total} questions from there; get ${foundation.passMark} right and you come back to your Class ${classLevel ?? ""} questions. Your class and your score do not change.`,
                                `Wahan se ${foundation.total} sawal; ${foundation.passMark} sahi karo to apni Class ${classLevel ?? ""} ke sawalon par wapas. Tumhari class aur score nahi badalte.`)}
                        </p>
                    </div>
                ) : null}
            </div>
        </section>
    );
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Layers, Lightbulb, Play, RotateCcw, XCircle } from "lucide-react";
import { BilingualText } from "@/components/bilingual-text";
import { ConceptBrowser, type BrowsableTopic } from "@/components/concept-browser";
import { ConceptGraphic } from "@/components/concept-graphic";
import { InsightBlock } from "@/components/insight-block";
import { LessonPractice } from "@/components/student/lesson-practice";
import { PiSays, type PiMood } from "@/components/student/pi-mascot";
import { LanguageSwitch } from "@/components/student/quiz-hud";
import { TextToSpeech } from "@/components/tts-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAidLanguage, type AidLanguage } from "@/lib/aid-language";
import { auth } from "@/lib/firebase";
import { commonMistake, keyIdea, LESSON_STEPS, withoutHeading, type LessonPracticeItem } from "@/lib/lesson-steps";
import { cn } from "@/lib/utils";
import type { LocalizedText } from "@/types/curriculum";

interface LessonConcept {
    microTag: string;
    title: string;
    topicTitle: string;
    concept: LocalizedText;
    visualKind: string;
    imageUrl?: string;
    example?: LocalizedText | null;
    subTopic?: LocalizedText | null;
    prerequisiteTitle?: string | null;
}

type Lang = AidLanguage | null;
/** Labels follow the language the student chose for their aids; English until they choose. */
const say = (lang: Lang, english: string, romanUrdu: string) => (lang === "roman-urdu" ? romanUrdu : english);
const read = (lang: Lang, text: { english: string; romanUrdu: string }) => (lang === "roman-urdu" && text.romanUrdu ? text.romanUrdu : text.english);

const PI_LINES: Record<number, [string, string]> = {
    1: ["Today's big idea is one line. Read it, then we try it ourselves.", "Aaj ka big idea sirf ek line hai. Parho, phir hum khud karenge."],
    2: ["Read slowly. The example shows the idea in real life.", "Aaram se parho. Misaal asal zindagi mein idea dikhati hai."],
    3: ["Your turn. Pick an answer, then press Check.", "Ab tumhari baari. Jawab chuno, phir Check dabao."],
    4: ["Many students slip here. See why, so you do not.", "Bohat students yahan phislte hain. Dekho kyun, taake tum na phislo."],
    5: ["One quick check, no score. Then the real quiz.", "Ek quick check, score nahi. Phir asli quiz."],
};
const PI_MOODS: Record<number, PiMood> = { 1: "happy", 2: "think", 3: "happy", 4: "oops", 5: "cheer" };

function LearnContent() {
    const router = useRouter();
    const params = useSearchParams();
    const microTag = params.get("microTag") ?? params.get("topicId") ?? "";
    const classLevel = Number(params.get("class") ?? 6);
    const [language, chooseLanguage] = useAidLanguage();
    const [user, setUser] = useState<User | null>(null);
    const [content, setContent] = useState<LocalizedText | null>(null);
    const [concept, setConcept] = useState<LessonConcept | null>(null);
    const [practice, setPractice] = useState<LessonPracticeItem[]>([]);
    const [teachingLevel, setTeachingLevel] = useState(1);
    const [step, setStep] = useState(1);
    const [reached, setReached] = useState(1);
    const [starting, setStarting] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [browseTopics, setBrowseTopics] = useState<BrowsableTopic[] | null>(null);
    const [browseClass, setBrowseClass] = useState(classLevel);

    useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
        if (!currentUser) return router.replace("/login?role=student");
        setUser(currentUser);
        // Reached from the "Learn Topics" nav with no concept chosen: show a picker.
        if (!microTag) return loadTopics(currentUser);
        await loadLesson(currentUser, 1);
    }), [router]);

    async function loadTopics(currentUser: User) {
        setLoading(true); setError("");
        try {
            const response = await fetch("/api/progress", { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setBrowseTopics(data.topics);
            setBrowseClass(data.profile.classLevel);
        } catch { setError("Your topics could not be loaded."); }
        finally { setLoading(false); }
    }

    async function loadLesson(currentUser: User, level: number) {
        setLoading(true); setError("");
        try {
            const response = await fetch("/api/teach", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
                body: JSON.stringify({ microTag, classLevel, teachingLevel: level }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setContent(data.content);
            setConcept(data.concept);
            // The practice questions stay put while the explanation is told another way.
            setPractice((current) => (current.length ? current : (data.practice ?? [])));
            setTeachingLevel(level);
        } catch (caught) {
            // A locked lesson names the one to finish first; anything else is a plain failure.
            setError(caught instanceof Error && caught.message ? caught.message : "The lesson could not be loaded.");
        }
        finally { setLoading(false); }
    }

    async function startQuiz() {
        if (!user || !concept || starting) return;
        setStarting(true);
        try {
            await fetch("/api/teach", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
                body: JSON.stringify({ microTag: concept.microTag, understood: true, teachingLevel }),
            });
        } finally {
            // The quiz level is chosen automatically; students go straight in.
            router.push(`/quiz?microTag=${encodeURIComponent(concept.microTag)}&class=${classLevel}`);
        }
    }

    function goTo(next: number) {
        const target = Math.max(1, Math.min(LESSON_STEPS.length, next));
        setStep(target);
        setReached((current) => Math.max(current, target));
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    const retry = () => user && (microTag ? loadLesson(user, teachingLevel) : loadTopics(user));
    const stepName = (index: number) => say(language, LESSON_STEPS[index].english, LESSON_STEPS[index].romanUrdu);

    return (
        <div className="min-h-screen bg-[#F4F6FB] font-body text-slate-900">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
                    <Button variant="ghost" className="px-2 font-bold sm:px-4" asChild>
                        <Link href="/dashboard" aria-label="Dashboard"><ArrowLeft className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Dashboard</span></Link>
                    </Button>
                    {concept ? <p className="min-w-0 flex-1 truncate text-center text-sm font-extrabold text-slate-600">{concept.topicTitle} · {concept.title}</p> : null}
                    <LanguageSwitch value={language} onChange={chooseLanguage} />
                </div>
            </header>
            <main className="mx-auto max-w-6xl px-4 py-6">
                {error ? (
                    <Alert variant="destructive" className="mb-5">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription className="flex items-center justify-between gap-3">
                            {error}<Button size="sm" variant="outline" onClick={retry}>Try again</Button>
                        </AlertDescription>
                    </Alert>
                ) : null}

                {!microTag ? (
                    loading ? <p className="py-20 text-center font-bold text-slate-500">Loading topics...</p> : (
                        <>
                            <div className="mb-6">
                                <h1 className="font-display text-3xl font-semibold">Learn Topics</h1>
                                <p className="text-sm font-bold text-slate-500">Pick a concept to start a lesson.</p>
                            </div>
                            {browseTopics ? <ConceptBrowser topics={browseTopics} classLevel={browseClass} locale="english" /> : null}
                        </>
                    )
                ) : loading && !concept ? (
                    <p className="py-20 text-center font-bold text-slate-500">Loading lesson...</p>
                ) : concept && content ? (() => {
                    const idea = keyIdea(concept.concept);
                    const mistake = commonMistake(practice[0]);
                    const quickCheck = practice[1] ?? null;
                    const stepsLeft = LESSON_STEPS.length - step;
                    const piLine = say(language, ...PI_LINES[step]);
                    const startButton = (className: string) => (
                        <Button size="lg" className={cn("h-13 rounded-2xl text-base font-extrabold", className)} onClick={startQuiz} disabled={starting}>
                            <Play className="mr-2 h-5 w-5" />{say(language, "Start the quiz", "Quiz shuru karo")}
                        </Button>
                    );
                    return (
                        <>
                            <div className="mb-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold text-slate-500">
                                    <span>{step} / {LESSON_STEPS.length} · {stepName(step - 1)}</span>
                                    <span>{stepsLeft > 0 ? say(language, `${stepsLeft} ${stepsLeft === 1 ? "step" : "steps"} left, then the quiz`, `${stepsLeft} qadam baqi, phir quiz`) : say(language, "Last step, then the quiz", "Aakhri qadam, phir quiz")}</span>
                                </div>
                                <div className="mt-2 flex gap-1.5" role="progressbar" aria-label="Lesson progress" aria-valuemin={1} aria-valuemax={LESSON_STEPS.length} aria-valuenow={step}>
                                    {LESSON_STEPS.map((item, index) => <span key={item.key} className={cn("h-2 flex-1 rounded-full", index < step ? "bg-indigo-600" : "bg-slate-200")} />)}
                                </div>
                            </div>

                            <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)_300px]">
                                <nav aria-label="Lesson steps" className="hidden lg:block">
                                    <ol className="space-y-1">
                                        {LESSON_STEPS.map((item, index) => {
                                            const n = index + 1;
                                            const open = n <= reached;
                                            return (
                                                <li key={item.key}>
                                                    <button type="button" disabled={!open} onClick={() => goTo(n)} aria-current={n === step ? "step" : undefined}
                                                        className={cn("flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-extrabold transition",
                                                            n === step ? "bg-indigo-600 text-white" : open ? "bg-white text-slate-800 hover:bg-indigo-50" : "text-slate-400")}>
                                                        <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs", n === step ? "bg-white/20" : n < step ? "bg-emerald-100 text-emerald-700" : "bg-slate-100")}>
                                                            {n < step ? <CheckCircle2 className="h-4 w-4" /> : n}
                                                        </span>
                                                        {stepName(index)}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </nav>

                                <section className="min-w-0">
                                    <PiSays mood={PI_MOODS[step]} className="mb-4 lg:hidden">{piLine}</PiSays>

                                    {step === 1 ? (
                                        <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="rounded-xl bg-teal-50 px-2.5 py-1 text-xs font-extrabold uppercase text-teal-800">{stepName(0)}</span>
                                                <TextToSpeech text={idea.english} />
                                            </div>
                                            <h1 className="mt-3 font-display text-xl font-semibold text-slate-500">{concept.title}</h1>
                                            <p className="mt-2 font-display text-3xl font-bold leading-snug md:text-4xl md:leading-snug" lang={language === "roman-urdu" ? "ur-Latn" : undefined}>{read(language, idea)}</p>
                                            <ConceptGraphic imageUrl={concept.imageUrl} alt={concept.title} className="mt-5 rounded-2xl" />
                                            <div className="mt-5 flex flex-wrap gap-2">
                                                <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700"><BookOpen className="h-3.5 w-3.5" />{concept.topicTitle}</span>
                                                {concept.subTopic ? <span className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-extrabold text-slate-700"><Layers className="h-3.5 w-3.5" />{read(language, concept.subTopic)}</span> : null}
                                                {concept.prerequisiteTitle ? <span className="inline-flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-800">{say(language, `First: ${concept.prerequisiteTitle}`, `Pehle: ${concept.prerequisiteTitle}`)}</span> : null}
                                            </div>
                                        </section>
                                    ) : null}

                                    {step === 2 ? (
                                        <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="rounded-xl bg-teal-50 px-2.5 py-1 text-xs font-extrabold uppercase text-teal-800">{stepName(1)}</span>
                                                <TextToSpeech text={withoutHeading(content.english)} />
                                            </div>
                                            <h2 className="mt-3 font-display text-2xl font-semibold">{concept.title}</h2>
                                            <div className="mt-3">
                                                <BilingualText text={{ english: withoutHeading(content.english), romanUrdu: withoutHeading(content.romanUrdu) }} markdown switcher={false} />
                                            </div>
                                            <div className="mt-5">
                                                <Button variant="outline" className="font-bold" onClick={() => user && loadLesson(user, Math.min(3, teachingLevel + 1))} disabled={loading}>
                                                    <RotateCcw className="mr-2 h-4 w-4" />{say(language, "Explain another way", "Doosre tareeqe se samjhao")}
                                                </Button>
                                            </div>
                                        </section>
                                    ) : null}

                                    {step === 3 ? (
                                        practice[0] ? (
                                            <LessonPractice key={practice[0].id} item={practice[0]} language={language} eyebrow={stepName(2)} note={say(language, "Not scored", "Score nahi")} />
                                        ) : (
                                            <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
                                                <span className="rounded-xl bg-teal-50 px-2.5 py-1 text-xs font-extrabold uppercase text-teal-800">{stepName(2)}</span>
                                                <p className="mt-3 font-bold text-slate-600">{say(language, "This lesson has no practice questions yet. Read the idea again, then go on.", "Is lesson ke practice sawal abhi nahi hain. Idea dobara parho, phir aagay chalo.")}</p>
                                            </section>
                                        )
                                    ) : null}

                                    {step === 4 ? (
                                        <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8">
                                            <span className="rounded-xl bg-rose-50 px-2.5 py-1 text-xs font-extrabold uppercase text-rose-800">{stepName(3)}</span>
                                            {mistake && practice[0] ? (
                                                <>
                                                    <h2 className="mt-3 font-display text-2xl font-semibold leading-snug" lang={language === "roman-urdu" ? "ur-Latn" : undefined}>{read(language, practice[0].question)}</h2>
                                                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                                                        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">
                                                            <p className="text-xs font-extrabold uppercase text-emerald-800">{say(language, "Right", "Sahi")}</p>
                                                            <p className="mt-1 font-display text-xl font-semibold text-emerald-900">{mistake.right.id}. {read(language, mistake.right)}</p>
                                                            <p className="mt-2 text-base leading-7 text-emerald-900">{read(language, practice[0].explanation)}</p>
                                                        </div>
                                                        <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4">
                                                            <p className="text-xs font-extrabold uppercase text-rose-800">{say(language, "Common slip", "Aam ghalti")}</p>
                                                            <p className="mt-1 font-display text-xl font-semibold text-rose-900">{mistake.wrong.id}. {read(language, mistake.wrong)}</p>
                                                            <p className="mt-2 text-base leading-7 text-rose-900">{read(language, mistake.reason)}</p>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="mt-3 font-bold text-slate-600">{say(language, "Keep the big idea in mind. In the quiz, every wrong answer explains itself.", "Big idea yaad rakho. Quiz mein har ghalat jawab apni wajah batata hai.")}</p>
                                            )}
                                            <InsightBlock tone="hint" className="mt-5" icon={<Lightbulb className="h-4 w-4" />} title={say(language, "Remember", "Yaad rakho")}>
                                                <p className="text-base font-bold leading-7" lang={language === "roman-urdu" ? "ur-Latn" : undefined}>{read(language, idea)}</p>
                                            </InsightBlock>
                                        </section>
                                    ) : null}

                                    {step === 5 ? (
                                        quickCheck ? (
                                            <LessonPractice key={quickCheck.id} item={quickCheck} language={language} eyebrow={stepName(4)} note={say(language, "1 question · not scored", "1 sawal · score nahi")} />
                                        ) : (
                                            <section className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 text-center">
                                                <span className="rounded-xl bg-teal-50 px-2.5 py-1 text-xs font-extrabold uppercase text-teal-800">{stepName(4)}</span>
                                                <p className="mt-3 font-display text-2xl font-semibold">{say(language, "Ready for the quiz?", "Quiz ke liye tayyar?")}</p>
                                                <p className="mt-1 font-bold text-slate-600">{say(language, "Every right answer earns XP. A wrong one explains itself.", "Har sahi jawab XP deta hai. Ghalat apni wajah batata hai.")}</p>
                                            </section>
                                        )
                                    ) : null}

                                    <div className="mt-5 flex items-center gap-3">
                                        <Button variant="outline" size="lg" className="h-13 rounded-2xl px-4 font-bold" onClick={() => goTo(step - 1)} disabled={step === 1}>
                                            <ArrowLeft className="h-5 w-5 sm:mr-2" /><span className="hidden sm:inline">{say(language, "Back", "Peechay")}</span>
                                        </Button>
                                        {step < LESSON_STEPS.length ? (
                                            <Button size="lg" className="h-13 flex-1 rounded-2xl text-base font-extrabold" onClick={() => goTo(step + 1)}>
                                                {say(language, "Next", "Agay")}<ArrowRight className="ml-2 h-5 w-5" />
                                            </Button>
                                        ) : startButton("flex-1")}
                                    </div>
                                    {step < LESSON_STEPS.length ? (
                                        <div className="mt-3 text-center lg:hidden">
                                            <Button variant="ghost" className="font-bold text-slate-600" onClick={startQuiz} disabled={starting}>{say(language, "Skip to the quiz", "Seedha quiz")}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                                        </div>
                                    ) : null}
                                </section>

                                <aside className="hidden space-y-4 lg:block">
                                    <PiSays mood={PI_MOODS[step]}>{piLine}</PiSays>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <p className="text-[11px] font-extrabold uppercase text-slate-500">{say(language, "Remember", "Yaad rakho")}</p>
                                        <p className="mt-1 font-bold leading-7" lang={language === "roman-urdu" ? "ur-Latn" : undefined}>{read(language, idea)}</p>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <p className="text-[11px] font-extrabold uppercase text-slate-500">{say(language, "Today's lesson", "Aaj ka lesson")}</p>
                                        <p className="mt-1 font-display text-2xl font-bold text-indigo-700">{step}/{LESSON_STEPS.length}</p>
                                        <p className="text-sm font-bold text-slate-600">{stepsLeft > 0 ? say(language, `${stepsLeft} ${stepsLeft === 1 ? "step" : "steps"} left, then the quiz`, `${stepsLeft} qadam baqi, phir quiz`) : say(language, "Then the quiz", "Phir quiz")}</p>
                                        <p className="mt-1 text-xs font-bold text-slate-500">{say(language, "In the quiz: +1 XP per right answer", "Quiz mein: har sahi jawab par +1 XP")}</p>
                                        {step < LESSON_STEPS.length ? (
                                            <Button variant="ghost" className="mt-2 w-full font-bold text-slate-600" onClick={startQuiz} disabled={starting}>{say(language, "Skip to the quiz", "Seedha quiz")}<ArrowRight className="ml-1 h-4 w-4" /></Button>
                                        ) : null}
                                    </div>
                                </aside>
                            </div>
                        </>
                    );
                })() : null}
            </main>
        </div>
    );
}

export default function LearnPage() {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}><LearnContent /></Suspense>;
}

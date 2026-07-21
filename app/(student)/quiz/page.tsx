"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { ArrowLeft, ArrowRight, CheckCircle2, HelpCircle, Lightbulb, RotateCcw, Trophy, XCircle } from "lucide-react";
import { ConceptGraphic } from "@/components/concept-graphic";
import { SessionControls } from "@/components/session-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { auth } from "@/lib/firebase";
import type { ClientQuestion } from "@/lib/assessment-content";
import type { Locale } from "@/types/curriculum";

interface QuizState {
    id: string;
    kind: "mastery" | "weekly";
    microTag: string;
    question?: ClientQuestion;
    questionNumber: number;
    totalQuestions: number;
    score: number;
}

interface RemedialState {
    microTag: string;
    title: string;
    concept: string;
    visualKind: string;
    imageUrl?: string;
}

const words = {
    english: { exit: "Exit quiz", question: "Question", hint: "Use a hint", submit: "Check answer", correct: "Correct", review: "Review this foundation", continue: "Continue quiz", complete: "Quiz complete", mastered: "Concept mastered", practice: "Keep practicing", retry: "Start a fresh retry", dashboard: "Dashboard", failed: "The quiz could not continue. Please try again." },
    "roman-urdu": { exit: "Quiz band karein", question: "Sawal", hint: "Ishara lein", submit: "Jawab check karein", correct: "Durust", review: "Is bunyaad ko dobara dekhein", continue: "Quiz jari rakhein", complete: "Quiz mukammal", mastered: "Concept mukammal samajh aa gaya", practice: "Mazeed mashq karein", retry: "Nayi koshish shuru karein", dashboard: "Dashboard", failed: "Quiz jari nahin reh saka. Dobara koshish karein." },
};

function QuizContent() {
    const router = useRouter();
    const params = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [locale, setLocale] = useState<Locale>("english");
    const [quiz, setQuiz] = useState<QuizState | null>(null);
    const [selected, setSelected] = useState("");
    const [hint, setHint] = useState("");
    const [feedback, setFeedback] = useState("");
    const [remedial, setRemedial] = useState<RemedialState | null>(null);
    const [result, setResult] = useState<{ percentage: number; mastered: boolean } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const t = words[locale];

    useEffect(() => {
        const storedLocale: Locale = localStorage.getItem("mathTutorLocale") === "roman-urdu" ? "roman-urdu" : "english";
        setLocale(storedLocale);
        return onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) return router.replace("/login?role=student");
            if (!currentUser.emailVerified) {
                await signOut(auth);
                return router.replace("/login?role=student&verify=1");
            }
            setUser(currentUser);
            await startQuiz(currentUser, storedLocale);
        });
    }, [router]);

    async function startQuiz(currentUser: User, selectedLocale: Locale, retryOf?: string) {
        setLoading(true);
        setError("");
        setQuiz(null);
        setResult(null);
        setRemedial(null);
        setSelected("");
        setHint("");
        setFeedback("");
        try {
            const response = await fetch("/api/quiz", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
                body: JSON.stringify({
                    kind: params.get("kind") === "weekly" ? "weekly" : "mastery",
                    microTag: params.get("microTag") ?? params.get("topicId"),
                    classLevel: Number(params.get("class") ?? 6),
                    difficulty: params.get("difficulty") ?? localStorage.getItem("mathTutorDifficulty") ?? "medium",
                    locale: selectedLocale,
                    retryOf,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setQuiz(data.session);
        } catch {
            setError(words[selectedLocale].failed);
        } finally {
            setLoading(false);
        }
    }

    async function evaluate(action: "hint" | "answer" | "remedialComplete") {
        if (!user || !quiz || loading) return;
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/evaluate", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
                body: JSON.stringify({
                    sessionId: quiz.id,
                    eventId: crypto.randomUUID(),
                    action,
                    questionId: quiz.question?.id,
                    optionId: selected,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            if (action === "hint") {
                setHint(data.hint);
                setQuiz({ ...quiz, score: data.score });
                return;
            }
            if (data.completed) {
                setResult({ percentage: data.percentage, mastered: data.mastered });
                return;
            }
            if (data.status === "remedial_required") {
                setRemedial(data.remedial);
                setFeedback(data.explanation ?? "");
                setQuiz({ ...quiz, score: data.score });
                return;
            }
            setFeedback(data.isCorrect ? data.explanation ?? t.correct : "");
            setQuiz({ ...quiz, question: data.question, questionNumber: data.questionNumber, score: data.score });
            setSelected("");
            setHint("");
            setRemedial(null);
        } catch {
            setError(t.failed);
        } finally {
            setLoading(false);
        }
    }

    if (result && quiz) return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-lg rounded-lg border-t-4 border-t-emerald-500 text-center">
                <CardHeader><Trophy className="mx-auto mb-3 h-12 w-12 text-amber-500" /><CardTitle>{t.complete}</CardTitle><p className="text-muted-foreground">{result.mastered ? t.mastered : t.practice}</p></CardHeader>
                <CardContent><p className="text-5xl font-bold text-primary">{result.percentage}%</p></CardContent>
                <CardFooter className="grid gap-3"><Button onClick={() => user && startQuiz(user, locale, quiz.id)}><RotateCcw className="mr-2 h-4 w-4" />{t.retry}</Button><Button variant="outline" asChild><Link href="/dashboard">{t.dashboard}</Link></Button></CardFooter>
            </Card>
        </main>
    );

    if (loading && !quiz) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="font-medium text-slate-600">Preparing quiz...</p></div>;

    if (remedial && quiz) return (
        <main className="min-h-screen bg-slate-50 p-4 md:p-8">
            <Card className="mx-auto max-w-2xl rounded-lg overflow-hidden">
                <ConceptGraphic kind={remedial.visualKind} />
                <CardHeader><Badge variant="outline" className="w-fit"><HelpCircle className="mr-1 h-3 w-3" />{t.review}</Badge><CardTitle>{remedial.title}</CardTitle></CardHeader>
                <CardContent className="space-y-4"><p className="leading-7">{remedial.concept}</p>{feedback ? <Alert><Lightbulb className="h-4 w-4" /><AlertDescription>{feedback}</AlertDescription></Alert> : null}</CardContent>
                <CardFooter><Button className="ml-auto" onClick={() => evaluate("remedialComplete")} disabled={loading}>{t.continue}<ArrowRight className="ml-2 h-4 w-4" /></Button></CardFooter>
            </Card>
        </main>
    );

    const question = quiz?.question;
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white"><div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4"><Button variant="ghost" asChild><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />{t.exit}</Link></Button><SessionControls locale={locale} onLocaleChange={(next) => { setLocale(next); if (user) void startQuiz(user, next, quiz?.id); }} /></div></header>
            <main className="mx-auto max-w-3xl px-4 py-8">
                {error ? <Alert variant="destructive" className="mb-5"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}
                {quiz && question ? <><div className="mb-4 flex items-center justify-between text-sm"><span>{t.question} {quiz.questionNumber} / {quiz.totalQuestions}</span><span className="font-semibold">Score {quiz.score}</span></div><Progress value={(quiz.questionNumber / quiz.totalQuestions) * 100} className="mb-6 h-2" /><Card className="rounded-lg"><CardHeader><div className="flex items-center justify-between"><Badge variant="outline">{question.difficulty}</Badge><span className="text-xs text-muted-foreground">{question.microTag}</span></div><CardTitle className="pt-4 text-xl leading-relaxed">{question.question}</CardTitle></CardHeader><CardContent className="grid gap-3">{question.options.map((option) => <Button key={option.id} variant={selected === option.id ? "default" : "outline"} className="h-auto min-h-12 justify-start whitespace-normal text-left" onClick={() => setSelected(option.id)} disabled={loading}><span className="mr-3 font-bold">{option.id}</span>{option.text}</Button>)}{hint ? <Alert className="mt-3"><Lightbulb className="h-4 w-4" /><AlertTitle>{t.hint}</AlertTitle><AlertDescription>{hint}</AlertDescription></Alert> : null}</CardContent><CardFooter className="flex justify-between border-t pt-5"><Button variant="ghost" onClick={() => evaluate("hint")} disabled={loading || !!hint}><Lightbulb className="mr-2 h-4 w-4" />{t.hint}</Button><Button onClick={() => evaluate("answer")} disabled={!selected || loading}>{t.submit}<CheckCircle2 className="ml-2 h-4 w-4" /></Button></CardFooter></Card></> : <Button onClick={() => user && startQuiz(user, locale)}>Try again</Button>}
            </main>
        </div>
    );
}

export default function QuizPage() {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}><QuizContent /></Suspense>;
}

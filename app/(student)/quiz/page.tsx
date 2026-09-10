"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
    Award, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, CloudOff, Flame,
    HelpCircle, Lightbulb, RefreshCw, RotateCcw, Sparkles, Target, Trophy, XCircle,
} from "lucide-react";
import { ConceptGraphic } from "@/components/concept-graphic";
import { SessionControls } from "@/components/session-controls";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { auth } from "@/lib/firebase";
import {
    clearSessionQueue,
    enqueueAnswer,
    pendingForSession,
    syncQueue,
} from "@/lib/offline-queue";
import type { ClientQuestion } from "@/lib/assessment-content";
import type { MistakePayload } from "@/types/assessment";
import type { Locale } from "@/types/curriculum";

interface QuizState {
    id: string;
    kind: "mastery" | "weekly";
    microTag: string;
    question?: ClientQuestion;
    questions?: ClientQuestion[];
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

type MistakeState = MistakePayload;
interface MisconceptionState { microTag: string; type: string; label: string; guidance: string; practiceTotal: number }
interface PracticeState { number: number; total: number; isRecheck: boolean }
interface ResultState {
    percentage: number;
    mastered: boolean;
    xpEarned?: number;
    totalXp?: number;
    streak?: number;
    newBadges?: Array<{ id: string; title: string; description: string; icon: string }>;
}

const words = {
    english: {
        exit: "Exit quiz", question: "Question", hint: "Use a hint", submit: "Check answer", correct: "Correct",
        review: "Review this foundation", continue: "Continue quiz", complete: "Quiz complete",
        mastered: "Concept mastered", practice: "Keep practicing", retry: "Start a fresh retry",
        dashboard: "Dashboard", failed: "The quiz could not continue. Please try again.",
        mistakeTitle: "What went wrong", misconceptionTitle: "This mistake keeps coming back",
        misconceptionBody: "You have made this kind of mistake a few times on this concept. Here is the idea again, then a short set of practice questions.",
        startPractice: "Start targeted practice", practiceLabel: "Targeted practice",
        recheck: "Re-check question", xpEarned: "XP earned", streakLabel: "Day streak",
        newBadges: "New badges", totalXp: "Total XP",
        offlineTitle: "You are offline", offlineBody: "Keep going. Your answers are saved on this device and will sync automatically.",
        pendingOne: "answer waiting to sync", pendingMany: "answers waiting to sync",
        syncing: "Syncing your answers...", syncNow: "Sync now",
        offlineDone: "All questions answered offline", offlineDoneBody: "Reconnect to submit them and see your result.",
    },
    "roman-urdu": {
        exit: "Quiz band karein", question: "Sawal", hint: "Ishara lein", submit: "Jawab check karein", correct: "Durust",
        review: "Is bunyaad ko dobara dekhein", continue: "Quiz jari rakhein", complete: "Quiz mukammal",
        mastered: "Concept mukammal samajh aa gaya", practice: "Mazeed mashq karein", retry: "Nayi koshish shuru karein",
        dashboard: "Dashboard", failed: "Quiz jari nahin reh saka. Dobara koshish karein.",
        mistakeTitle: "Ghalti kahan hui", misconceptionTitle: "Yeh ghalti baar baar ho rahi hai",
        misconceptionBody: "Aap is concept mein yeh ghalti kai baar kar chuke hain. Pehle khayal dobara samjhein, phir chhoti si mashq karein.",
        startPractice: "Makhsoos mashq shuru karein", practiceLabel: "Makhsoos mashq",
        recheck: "Dobara jaanch ka sawal", xpEarned: "XP mila", streakLabel: "Din ka streak",
        newBadges: "Naye badges", totalXp: "Kul XP",
        offlineTitle: "Aap offline hain", offlineBody: "Jari rakhein. Aap ke jawabat is device par mehfooz hain aur khud sync ho jayenge.",
        pendingOne: "jawab sync hone ka muntazir", pendingMany: "jawabat sync hone ke muntazir",
        syncing: "Aap ke jawabat sync ho rahe hain...", syncNow: "Ab sync karein",
        offlineDone: "Tamam sawal offline hal ho gaye", offlineDoneBody: "Natija dekhne ke liye dobara connect karein.",
    },
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
    const [mistake, setMistake] = useState<MistakeState | null>(null);
    const [misconception, setMisconception] = useState<MisconceptionState | null>(null);
    const [practice, setPractice] = useState<PracticeState | null>(null);
    const [result, setResult] = useState<ResultState | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [pendingCount, setPendingCount] = useState(0);
    const [offline, setOffline] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [offlineFinished, setOfflineFinished] = useState(false);
    const t = words[locale];

    useEffect(() => {
        const storedLocale: Locale = localStorage.getItem("mathTutorLocale") === "roman-urdu" ? "roman-urdu" : "english";
        setLocale(storedLocale);
        return onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) return router.replace("/login?role=student");
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
        setMistake(null);
        setMisconception(null);
        setPractice(null);
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
                    homeworkId: params.get("homeworkId") ?? undefined,
                    retryOf,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            // A fresh session invalidates anything still queued from an abandoned one.
            clearSessionQueue(data.session.id);
            setPendingCount(0);
            setOfflineFinished(false);
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
                setResult({
                    percentage: data.percentage,
                    mastered: data.mastered,
                    xpEarned: data.xpEarned,
                    totalXp: data.totalXp,
                    streak: data.streak,
                    newBadges: data.newBadges ?? [],
                });
                return;
            }
            if (data.status === "remedial_required") {
                setRemedial(data.remedial ?? null);
                setMistake(data.mistake ?? null);
                setMisconception(data.misconception ?? null);
                setFeedback(data.explanation ?? "");
                setQuiz({ ...quiz, score: data.score });
                return;
            }

            // Active question or the next item in a targeted practice queue.
            setFeedback(data.isCorrect ? data.explanation ?? t.correct : data.explanation ?? "");
            setMistake(data.mistake ?? null);
            setPractice(data.status === "misconception_practice" ? data.practice ?? null : null);
            setQuiz({ ...quiz, question: data.question, questionNumber: data.questionNumber ?? quiz.questionNumber, score: data.score });
            setSelected("");
            setHint("");
            setRemedial(null);
            if (data.status !== "misconception_practice") setMisconception(null);
        } catch (caught) {
            // fetch only throws when the request never reached the server.
            if (action === "answer" && caught instanceof TypeError && quiz.question) {
                answerOffline(quiz, selected);
                return;
            }
            setError(t.failed);
        } finally {
            setLoading(false);
        }
    }

    /** Stores the answer on the device and moves on using the locally held questions. */
    function answerOffline(currentQuiz: QuizState, optionId: string) {
        enqueueAnswer({
            eventId: crypto.randomUUID(),
            sessionId: currentQuiz.id,
            questionId: currentQuiz.question!.id,
            optionId,
            position: currentQuiz.questionNumber - 1,
            queuedAt: Date.now(),
        });
        setPendingCount(pendingForSession(currentQuiz.id).length);
        setOffline(true);
        setError("");

        const next = currentQuiz.questions?.[currentQuiz.questionNumber];
        if (next) {
            setQuiz({ ...currentQuiz, question: next, questionNumber: currentQuiz.questionNumber + 1 });
            setSelected("");
            setHint("");
            setFeedback("");
            setMistake(null);
        } else {
            setOfflineFinished(true);
        }
    }

    async function refreshSession(currentUser: User, sessionId: string) {
        const response = await fetch("/api/quiz?sessionId=" + encodeURIComponent(sessionId), {
            headers: { Authorization: "Bearer " + (await currentUser.getIdToken()) },
        });
        const data = await response.json();
        if (!response.ok) return;
        const session = data.session;
        if (session.status === "completed") {
            setOfflineFinished(false);
            setResult({
                percentage: Math.round((session.score / Math.max(1, session.maxScore)) * 100),
                mastered: session.score / Math.max(1, session.maxScore) >= 0.7,
            });
            return;
        }
        setOfflineFinished(false);
        setQuiz((current) => current ? {
            ...current,
            question: session.question ?? current.question,
            questionNumber: session.questionNumber ?? current.questionNumber,
            score: session.score ?? current.score,
        } : current);
    }

    /** Replays queued answers oldest-first; the server de-duplicates by eventId. */
    async function flushQueue(currentUser: User, sessionId: string) {
        if (!pendingForSession(sessionId).length || syncing) return;
        setSyncing(true);
        try {
            const token = await currentUser.getIdToken();
            const outcome = await syncQueue(sessionId, async (item) => {
                const response = await fetch("/api/evaluate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                    body: JSON.stringify({
                        sessionId: item.sessionId,
                        eventId: item.eventId,
                        action: "answer",
                        questionId: item.questionId,
                        optionId: item.optionId,
                    }),
                });
                // 409 means remediation is pending, so the answer stays queued for afterwards.
                return { ok: response.ok, retryable: response.status >= 500 || response.status === 409 };
            });
            setPendingCount(pendingForSession(sessionId).length);
            if (outcome.synced > 0 || outcome.outcome !== "offline") {
                setOffline(false);
                await refreshSession(currentUser, sessionId);
            }
        } catch {
            setOffline(true);
        } finally {
            setSyncing(false);
        }
    }

    useEffect(() => {
        if (!user || !quiz) return;
        setPendingCount(pendingForSession(quiz.id).length);
        const goOnline = () => { setOffline(false); void flushQueue(user, quiz.id); };
        const goOffline = () => setOffline(true);
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        if (navigator.onLine) void flushQueue(user, quiz.id);
        else setOffline(true);
        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, [user, quiz?.id]);

    if (offlineFinished && quiz) return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-lg rounded-lg border-t-4 border-t-amber-500 text-center">
                <CardHeader>
                    <CloudOff className="mx-auto mb-3 h-12 w-12 text-amber-500" />
                    <CardTitle>{t.offlineDone}</CardTitle>
                    <p className="text-muted-foreground">{t.offlineDoneBody}</p>
                </CardHeader>
                <CardContent>
                    <p className="text-sm font-medium">
                        {pendingCount} {pendingCount === 1 ? t.pendingOne : t.pendingMany}
                    </p>
                </CardContent>
                <CardFooter className="grid gap-3">
                    <Button onClick={() => user && flushQueue(user, quiz.id)} disabled={syncing}>
                        <RefreshCw className={"mr-2 h-4 w-4 " + (syncing ? "animate-spin" : "")} />{syncing ? t.syncing : t.syncNow}
                    </Button>
                    <Button variant="outline" asChild><Link href="/dashboard">{t.dashboard}</Link></Button>
                </CardFooter>
            </Card>
        </main>
    );

    if (result && quiz) return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-lg rounded-lg border-t-4 border-t-emerald-500 text-center">
                <CardHeader>
                    <Trophy className="mx-auto mb-3 h-12 w-12 text-amber-500" />
                    <CardTitle>{t.complete}</CardTitle>
                    <p className="text-muted-foreground">{result.mastered ? t.mastered : t.practice}</p>
                </CardHeader>
                <CardContent className="space-y-5">
                    <p className="text-5xl font-bold text-primary">{result.percentage}%</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border bg-indigo-50 p-3">
                            <p className="text-xs font-semibold uppercase text-indigo-700">{t.xpEarned}</p>
                            <p className="text-2xl font-bold text-indigo-900">+{result.xpEarned ?? 0}</p>
                            {typeof result.totalXp === "number" ? <p className="text-xs text-indigo-700">{t.totalXp}: {result.totalXp}</p> : null}
                        </div>
                        <div className="rounded-lg border bg-amber-50 p-3">
                            <p className="text-xs font-semibold uppercase text-amber-700">{t.streakLabel}</p>
                            <p className="flex items-center justify-center gap-1 text-2xl font-bold text-amber-900">
                                <Flame className="h-5 w-5" />{result.streak ?? 0}
                            </p>
                        </div>
                    </div>
                    {result.newBadges?.length ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left">
                            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                                <Sparkles className="h-4 w-4" />{t.newBadges}
                            </p>
                            <ul className="space-y-1">
                                {result.newBadges.map((badge) => (
                                    <li key={badge.id} className="flex items-center gap-2 text-sm text-emerald-900">
                                        <Award className="h-4 w-4 shrink-0" />
                                        <span className="font-medium">{badge.title}</span>
                                        <span className="text-emerald-700">— {badge.description}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </CardContent>
                <CardFooter className="grid gap-3">
                    <Button onClick={() => user && startQuiz(user, locale, quiz.id)}><RotateCcw className="mr-2 h-4 w-4" />{t.retry}</Button>
                    <Button variant="outline" asChild><Link href="/dashboard">{t.dashboard}</Link></Button>
                </CardFooter>
            </Card>
        </main>
    );

    if (loading && !quiz) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="font-medium text-slate-600">Preparing quiz...</p></div>;

    if (remedial && quiz) return (
        <main className="min-h-screen bg-slate-50 p-4 md:p-8">
            <Card className="mx-auto max-w-2xl overflow-hidden rounded-lg">
                <ConceptGraphic kind={remedial.visualKind} />
                <CardHeader>
                    <Badge variant="outline" className="w-fit"><HelpCircle className="mr-1 h-3 w-3" />{t.review}</Badge>
                    <CardTitle>{remedial.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="leading-7">{remedial.concept}</p>
                    {mistake ? (
                        <Alert className="border-rose-200 bg-rose-50">
                            <XCircle className="h-4 w-4 text-rose-700" />
                            <AlertTitle className="text-rose-900">{t.mistakeTitle}: {mistake.label}</AlertTitle>
                            <AlertDescription className="text-rose-800">{mistake.whyWrong}</AlertDescription>
                        </Alert>
                    ) : feedback ? (
                        <Alert><Lightbulb className="h-4 w-4" /><AlertDescription>{feedback}</AlertDescription></Alert>
                    ) : null}
                    {misconception ? (
                        <Alert className="border-amber-300 bg-amber-50">
                            <AlertTriangle className="h-4 w-4 text-amber-700" />
                            <AlertTitle className="text-amber-900">{t.misconceptionTitle}</AlertTitle>
                            <AlertDescription className="space-y-2 text-amber-900">
                                <p>{t.misconceptionBody}</p>
                                <p className="font-medium">{misconception.guidance}</p>
                            </AlertDescription>
                        </Alert>
                    ) : null}
                </CardContent>
                <CardFooter>
                    <Button className="ml-auto" onClick={() => evaluate("remedialComplete")} disabled={loading}>
                        {misconception ? t.startPractice : t.continue}<ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </CardFooter>
            </Card>
        </main>
    );

    const question = quiz?.question;
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <Button variant="ghost" asChild><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />{t.exit}</Link></Button>
                    <SessionControls locale={locale} onLocaleChange={(next) => { setLocale(next); if (user) void startQuiz(user, next, quiz?.id); }} />
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8">
                {error ? <Alert variant="destructive" className="mb-5"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}
                {offline || pendingCount > 0 ? (
                    <Alert className="mb-5 border-slate-300 bg-slate-100">
                        <CloudOff className="h-4 w-4 text-slate-700" />
                        <AlertTitle className="text-slate-900">{offline ? t.offlineTitle : t.syncing}</AlertTitle>
                        <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                            <span>
                                {offline ? t.offlineBody : ""}
                                {pendingCount > 0 ? " " + pendingCount + " " + (pendingCount === 1 ? t.pendingOne : t.pendingMany) + "." : ""}
                            </span>
                            {pendingCount > 0 ? (
                                <Button size="sm" variant="outline" onClick={() => user && quiz && flushQueue(user, quiz.id)} disabled={syncing}>
                                    <RefreshCw className={"mr-2 h-3.5 w-3.5 " + (syncing ? "animate-spin" : "")} />{t.syncNow}
                                </Button>
                            ) : null}
                        </AlertDescription>
                    </Alert>
                ) : null}
                {practice ? (
                    <Alert className="mb-5 border-amber-300 bg-amber-50">
                        <Target className="h-4 w-4 text-amber-700" />
                        <AlertTitle className="text-amber-900">
                            {practice.isRecheck ? t.recheck : `${t.practiceLabel} ${practice.number} / ${practice.total}`}
                        </AlertTitle>
                        {misconception ? <AlertDescription className="text-amber-800">{misconception.label}</AlertDescription> : null}
                    </Alert>
                ) : null}
                {quiz && question ? (
                    <>
                        <div className="mb-4 flex items-center justify-between text-sm">
                            <span>{t.question} {quiz.questionNumber} / {quiz.totalQuestions}</span>
                            <span className="font-semibold">Score {quiz.score}</span>
                        </div>
                        <Progress value={(quiz.questionNumber / quiz.totalQuestions) * 100} className="mb-6 h-2" />
                        <Card className="rounded-lg">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline">{question.difficulty}</Badge>
                                    <span className="text-xs text-muted-foreground">{question.microTag}</span>
                                </div>
                                <CardTitle className="pt-4 text-xl leading-relaxed">{question.question}</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-3">
                                {question.options.map((option) => (
                                    <Button
                                        key={option.id}
                                        variant={selected === option.id ? "default" : "outline"}
                                        className="h-auto min-h-12 justify-start whitespace-normal text-left"
                                        onClick={() => setSelected(option.id)}
                                        disabled={loading}
                                    >
                                        <span className="mr-3 font-bold">{option.id}</span>{option.text}
                                    </Button>
                                ))}
                                {mistake && practice ? (
                                    <Alert className="mt-3 border-rose-200 bg-rose-50">
                                        <XCircle className="h-4 w-4 text-rose-700" />
                                        <AlertTitle className="text-rose-900">{t.mistakeTitle}: {mistake.label}</AlertTitle>
                                        <AlertDescription className="text-rose-800">{mistake.whyWrong}</AlertDescription>
                                    </Alert>
                                ) : null}
                                {hint ? <Alert className="mt-3"><Lightbulb className="h-4 w-4" /><AlertTitle>{t.hint}</AlertTitle><AlertDescription>{hint}</AlertDescription></Alert> : null}
                            </CardContent>
                            <CardFooter className="flex justify-between border-t pt-5">
                                <Button variant="ghost" onClick={() => evaluate("hint")} disabled={loading || !!hint}><Lightbulb className="mr-2 h-4 w-4" />{t.hint}</Button>
                                <Button onClick={() => evaluate("answer")} disabled={!selected || loading}>{t.submit}<CheckCircle2 className="ml-2 h-4 w-4" /></Button>
                            </CardFooter>
                        </Card>
                    </>
                ) : <Button onClick={() => user && startQuiz(user, locale)}>Try again</Button>}
            </main>
        </div>
    );
}

export default function QuizPage() {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}><QuizContent /></Suspense>;
}

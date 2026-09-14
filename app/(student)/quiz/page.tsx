"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
    Award, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, CloudOff, Flame,
    HelpCircle, Lightbulb, RefreshCw, RotateCcw, Sparkles, Target, Trophy, XCircle,
} from "lucide-react";
import { BilingualText } from "@/components/bilingual-text";
import { ConceptGraphic } from "@/components/concept-graphic";
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
import type { LocalizedText } from "@/types/curriculum";

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
    title: LocalizedText;
    concept: LocalizedText;
    visualKind: string;
    imageUrl?: string;
}

interface MisconceptionState { microTag: string; type: string; label: string; guidance: LocalizedText; practiceTotal: number }
interface PracticeState { number: number; total: number; isRecheck: boolean }
/** Feedback on the answer just submitted, shown above the next question. */
interface LastAnswer { isCorrect: boolean; explanation?: LocalizedText; mistake?: MistakePayload }
interface ResultState {
    percentage: number;
    mastered: boolean;
    xpEarned?: number;
    totalXp?: number;
    streak?: number;
    newBadges?: Array<{ id: string; title: string; description: string; icon: string }>;
}

function QuizContent() {
    const router = useRouter();
    const params = useSearchParams();
    const [user, setUser] = useState<User | null>(null);
    const [quiz, setQuiz] = useState<QuizState | null>(null);
    const [selected, setSelected] = useState("");
    const [hint, setHint] = useState<LocalizedText | null>(null);
    const [lastAnswer, setLastAnswer] = useState<LastAnswer | null>(null);
    const [remedial, setRemedial] = useState<RemedialState | null>(null);
    const [mistake, setMistake] = useState<MistakePayload | null>(null);
    const [explanation, setExplanation] = useState<LocalizedText | null>(null);
    const [misconception, setMisconception] = useState<MisconceptionState | null>(null);
    const [practice, setPractice] = useState<PracticeState | null>(null);
    const [result, setResult] = useState<ResultState | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [pendingCount, setPendingCount] = useState(0);
    const [offline, setOffline] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [offlineFinished, setOfflineFinished] = useState(false);

    useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
        if (!currentUser) return router.replace("/login?role=student");
        setUser(currentUser);
        await startQuiz(currentUser);
    }), [router]);

    function resetQuestionState() {
        setSelected("");
        setHint(null);
        setMistake(null);
        setExplanation(null);
    }

    async function startQuiz(currentUser: User, retryOf?: string) {
        setLoading(true);
        setError("");
        setQuiz(null);
        setResult(null);
        setRemedial(null);
        setMisconception(null);
        setPractice(null);
        setLastAnswer(null);
        resetQuestionState();
        try {
            const response = await fetch("/api/quiz", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
                // The level is chosen by the system from the student's results.
                body: JSON.stringify({
                    kind: params.get("kind") === "weekly" ? "weekly" : "mastery",
                    microTag: params.get("microTag") ?? params.get("topicId"),
                    classLevel: Number(params.get("class") ?? 6),
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
            setError("The quiz could not start. Please try again.");
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
                setHint(data.hint ?? null);
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
                setExplanation(data.explanation ?? null);
                setMisconception(data.misconception ?? null);
                setQuiz({ ...quiz, score: data.score });
                return;
            }

            // Next main question or the next item in a targeted practice queue.
            setLastAnswer(action === "answer" && typeof data.isCorrect === "boolean"
                ? { isCorrect: data.isCorrect, explanation: data.explanation, mistake: data.mistake }
                : null);
            setPractice(data.status === "misconception_practice" ? data.practice ?? null : null);
            setQuiz({ ...quiz, question: data.question, questionNumber: data.questionNumber ?? quiz.questionNumber, score: data.score });
            setRemedial(null);
            resetQuestionState();
            if (data.status !== "misconception_practice") setMisconception(null);
        } catch (caught) {
            // fetch only throws when the request never reached the server.
            if (action === "answer" && caught instanceof TypeError && quiz.question) {
                answerOffline(quiz, selected);
                return;
            }
            setError("The quiz could not continue. Please try again.");
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
        setLastAnswer(null);

        const next = currentQuiz.questions?.[currentQuiz.questionNumber];
        if (next) {
            setQuiz({ ...currentQuiz, question: next, questionNumber: currentQuiz.questionNumber + 1 });
            resetQuestionState();
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
                    <CardTitle>All questions answered offline</CardTitle>
                    <p className="text-muted-foreground">Reconnect to submit them and see your result.</p>
                </CardHeader>
                <CardContent>
                    <p className="text-sm font-medium">
                        {pendingCount} {pendingCount === 1 ? "answer" : "answers"} waiting to sync
                    </p>
                </CardContent>
                <CardFooter className="grid gap-3">
                    <Button onClick={() => user && flushQueue(user, quiz.id)} disabled={syncing}>
                        <RefreshCw className={"mr-2 h-4 w-4 " + (syncing ? "animate-spin" : "")} />{syncing ? "Syncing your answers..." : "Sync now"}
                    </Button>
                    <Button variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button>
                </CardFooter>
            </Card>
        </main>
    );

    if (result && quiz) return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-lg rounded-lg border-t-4 border-t-emerald-500 text-center">
                <CardHeader>
                    <Trophy className="mx-auto mb-3 h-12 w-12 text-amber-500" />
                    <CardTitle>Quiz complete</CardTitle>
                    <p className="text-muted-foreground">{result.mastered ? "Concept mastered" : "Keep practicing"}</p>
                </CardHeader>
                <CardContent className="space-y-5">
                    <p className="text-5xl font-bold text-primary">{result.percentage}%</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg border bg-indigo-50 p-3">
                            <p className="text-xs font-semibold uppercase text-indigo-700">XP earned</p>
                            <p className="text-2xl font-bold text-indigo-900">+{result.xpEarned ?? 0}</p>
                            {typeof result.totalXp === "number" ? <p className="text-xs text-indigo-700">Total XP: {result.totalXp}</p> : null}
                        </div>
                        <div className="rounded-lg border bg-amber-50 p-3">
                            <p className="text-xs font-semibold uppercase text-amber-700">Day streak</p>
                            <p className="flex items-center justify-center gap-1 text-2xl font-bold text-amber-900">
                                <Flame className="h-5 w-5" />{result.streak ?? 0}
                            </p>
                        </div>
                    </div>
                    {result.newBadges?.length ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left">
                            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                                <Sparkles className="h-4 w-4" />New badges
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
                    <Button onClick={() => user && startQuiz(user, quiz.id)}><RotateCcw className="mr-2 h-4 w-4" />Start a fresh retry</Button>
                    <Button variant="outline" asChild><Link href="/dashboard">Dashboard</Link></Button>
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
                    <Badge variant="outline" className="w-fit"><HelpCircle className="mr-1 h-3 w-3" />Review this foundation</Badge>
                    <CardTitle>{remedial.title.english}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    {mistake ? (
                        <Alert className="border-rose-200 bg-rose-50">
                            <XCircle className="h-4 w-4 text-rose-700" />
                            <AlertTitle className="text-rose-900">Why that answer is wrong: {mistake.label}</AlertTitle>
                            <AlertDescription className="text-rose-800">
                                <BilingualText text={mistake.whyWrong} />
                            </AlertDescription>
                        </Alert>
                    ) : null}
                    {explanation ? (
                        <Alert>
                            <Lightbulb className="h-4 w-4" />
                            <AlertTitle>Explanation</AlertTitle>
                            <AlertDescription><BilingualText text={explanation} /></AlertDescription>
                        </Alert>
                    ) : null}
                    <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Concept</p>
                        <BilingualText text={remedial.concept} />
                    </div>
                    {misconception ? (
                        <Alert className="border-amber-300 bg-amber-50">
                            <AlertTriangle className="h-4 w-4 text-amber-700" />
                            <AlertTitle className="text-amber-900">This mistake keeps coming back</AlertTitle>
                            <AlertDescription className="space-y-2 text-amber-900">
                                <p>You have made this kind of mistake a few times on this concept. Here is the idea again, then a short set of practice questions.</p>
                                <BilingualText text={misconception.guidance} className="font-medium" />
                            </AlertDescription>
                        </Alert>
                    ) : null}
                </CardContent>
                <CardFooter>
                    <Button className="ml-auto" onClick={() => evaluate("remedialComplete")} disabled={loading}>
                        {misconception ? "Start targeted practice" : "Continue quiz"}<ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </CardFooter>
            </Card>
        </main>
    );

    const question = quiz?.question;
    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
                    <Button variant="ghost" asChild><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Exit quiz</Link></Button>
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8">
                {error ? <Alert variant="destructive" className="mb-5"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}
                {offline || pendingCount > 0 ? (
                    <Alert className="mb-5 border-slate-300 bg-slate-100">
                        <CloudOff className="h-4 w-4 text-slate-700" />
                        <AlertTitle className="text-slate-900">{offline ? "You are offline" : "Syncing your answers..."}</AlertTitle>
                        <AlertDescription className="flex flex-wrap items-center justify-between gap-2 text-slate-700">
                            <span>
                                {offline ? "Keep going. Your answers are saved on this device and will sync automatically." : ""}
                                {pendingCount > 0 ? ` ${pendingCount} ${pendingCount === 1 ? "answer" : "answers"} waiting to sync.` : ""}
                            </span>
                            {pendingCount > 0 ? (
                                <Button size="sm" variant="outline" onClick={() => user && quiz && flushQueue(user, quiz.id)} disabled={syncing}>
                                    <RefreshCw className={"mr-2 h-3.5 w-3.5 " + (syncing ? "animate-spin" : "")} />Sync now
                                </Button>
                            ) : null}
                        </AlertDescription>
                    </Alert>
                ) : null}
                {practice ? (
                    <Alert className="mb-5 border-amber-300 bg-amber-50">
                        <Target className="h-4 w-4 text-amber-700" />
                        <AlertTitle className="text-amber-900">
                            {practice.isRecheck ? "Re-check question" : `Targeted practice ${practice.number} / ${practice.total}`}
                        </AlertTitle>
                        {misconception ? <AlertDescription className="text-amber-800">{misconception.label}</AlertDescription> : null}
                    </Alert>
                ) : null}
                {lastAnswer ? (
                    lastAnswer.isCorrect ? (
                        <Alert className="mb-5 border-emerald-200 bg-emerald-50">
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                            <AlertTitle className="text-emerald-900">Correct</AlertTitle>
                            {lastAnswer.explanation ? (
                                <AlertDescription className="text-emerald-900"><BilingualText text={lastAnswer.explanation} /></AlertDescription>
                            ) : null}
                        </Alert>
                    ) : lastAnswer.mistake ? (
                        <Alert className="mb-5 border-rose-200 bg-rose-50">
                            <XCircle className="h-4 w-4 text-rose-700" />
                            <AlertTitle className="text-rose-900">Why that answer is wrong: {lastAnswer.mistake.label}</AlertTitle>
                            <AlertDescription className="text-rose-800"><BilingualText text={lastAnswer.mistake.whyWrong} /></AlertDescription>
                        </Alert>
                    ) : null
                ) : null}
                {quiz && question ? (
                    <>
                        <div className="mb-4 flex items-center justify-between text-sm">
                            <span>Question {quiz.questionNumber} / {quiz.totalQuestions}</span>
                            <span className="font-semibold">Score {quiz.score}</span>
                        </div>
                        <Progress value={(quiz.questionNumber / quiz.totalQuestions) * 100} className="mb-6 h-2" />
                        <Card className="rounded-lg">
                            <CardHeader>
                                <Badge variant="outline" className="w-fit capitalize">{question.difficulty}</Badge>
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
                                {hint ? (
                                    <Alert className="mt-3">
                                        <Lightbulb className="h-4 w-4" />
                                        <AlertTitle>Hint</AlertTitle>
                                        <AlertDescription><BilingualText text={hint} /></AlertDescription>
                                    </Alert>
                                ) : null}
                            </CardContent>
                            <CardFooter className="flex justify-between border-t pt-5">
                                <Button variant="ghost" onClick={() => evaluate("hint")} disabled={loading || !!hint}><Lightbulb className="mr-2 h-4 w-4" />Use a hint</Button>
                                <Button onClick={() => evaluate("answer")} disabled={!selected || loading}>Check answer<CheckCircle2 className="ml-2 h-4 w-4" /></Button>
                            </CardFooter>
                        </Card>
                    </>
                ) : <Button onClick={() => user && startQuiz(user)}>Try again</Button>}
            </main>
        </div>
    );
}

export default function QuizPage() {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}><QuizContent /></Suspense>;
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
    AlertTriangle, ArrowLeft, ArrowRight, Award, CheckCircle2, CloudOff, Flame, HelpCircle, Layers, Lightbulb,
    LockOpen, RefreshCw, RotateCcw, Sparkles, Star, Target, XCircle,
} from "lucide-react";
import { BilingualText } from "@/components/bilingual-text";
import { ConceptGraphic } from "@/components/concept-graphic";
import { InsightBlock } from "@/components/insight-block";
import { PiMascot, PiSays, type PiMood } from "@/components/student/pi-mascot";
import { ComboChip, DifficultyLadder, LanguageSwitch, OptionTile, QuestionPath, QuizStats, ScoreChip, type PathResult } from "@/components/student/quiz-hud";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAidLanguage } from "@/lib/aid-language";
import { MISTAKE_TYPE_LABELS, misconceptionFitsTopic } from "@/lib/mistake-analysis";
import { auth } from "@/lib/firebase";
import {
    clearSessionQueue,
    enqueueAnswer,
    pendingForSession,
    syncQueue,
} from "@/lib/offline-queue";
import type { ClientQuestion } from "@/lib/assessment-content";
import type { FoundationProgress } from "@/lib/foundation-fallback";
import type { MistakePayload } from "@/types/assessment";
import type { Difficulty, LocalizedText, MisconceptionTag, MistakeType } from "@/types/curriculum";

interface QuizState {
    id: string;
    kind: "mastery" | "weekly";
    microTag: string;
    /** The student's own class; a foundation round borrows questions from the class before. */
    classLevel?: number;
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

interface MisconceptionState { microTag: string; type: MistakeType; tag: MisconceptionTag; label: string; guidance: LocalizedText; practiceTotal: number }
interface PracticeState { number: number; total: number; isRecheck: boolean }
interface FoundationResult { outcome: "passed" | "not_passed"; title: LocalizedText; classLevel: number }
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

/**
 * What the screen shows about the game: how each question went, the run of right answers,
 * and the last move on the difficulty ladder. The server keeps the real score; this only
 * makes it visible and fun.
 */
interface GameState {
    results: PathResult[];
    combo: number;
    bestCombo: number;
    trend: "up" | "down" | null;
    lastDifficulty: Difficulty | null;
    hints: number;
}

const FRESH_GAME: GameState = { results: [], combo: 0, bestCombo: 0, trend: null, lastDifficulty: null, hints: 0 };
const LEVELS: Difficulty[] = ["easy", "medium", "hard"];
const trendBetween = (from: Difficulty | null, to: Difficulty): "up" | "down" | null =>
    !from || from === to ? null : LEVELS.indexOf(to) > LEVELS.indexOf(from) ? "up" : "down";

type Lang = "english" | "roman-urdu" | null;
/** Pi speaks the language the student chose for their learning aids; English until they choose. */
const say = (lang: Lang, english: string, romanUrdu: string) => (lang === "roman-urdu" ? romanUrdu : english);

function QuizContent() {
    const router = useRouter();
    const params = useSearchParams();
    const [language, chooseLanguage] = useAidLanguage();
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
    const [foundation, setFoundation] = useState<FoundationProgress | null>(null);
    const [foundationResult, setFoundationResult] = useState<FoundationResult | null>(null);
    const [result, setResult] = useState<ResultState | null>(null);
    const [nextLesson, setNextLesson] = useState<{ microTag: string; title: string } | null>(null);
    const [game, setGame] = useState<GameState>(FRESH_GAME);
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

    // A mastered lesson gets a small shower of confetti; a light touch, and off for reduced motion.
    useEffect(() => {
        if (!result?.mastered) return;
        let cancelled = false;
        import("canvas-confetti")
            .then((module) => { if (!cancelled) module.default({ particleCount: 90, spread: 70, origin: { y: 0.6 }, disableForReducedMotion: true }); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [result?.mastered]);

    // The result screen says what opened next, from the same source as the dashboard.
    useEffect(() => {
        if (!result || !user) return;
        let cancelled = false;
        (async () => {
            try {
                const response = await fetch("/api/progress", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
                const data = await response.json();
                if (!cancelled && response.ok && data.nextLesson) setNextLesson({ microTag: data.nextLesson.microTag, title: data.nextLesson.title?.english ?? "" });
            } catch {
                // The result stands without it.
            }
        })();
        return () => { cancelled = true; };
    }, [result, user]);

    function resetQuestionState() {
        setSelected("");
        setHint(null);
        setMistake(null);
        setExplanation(null);
    }

    /** Records how a question on the lesson's own list went, for the path and the combo. */
    function recordMainAnswer(correct: boolean | null) {
        setGame((current) => {
            const combo = correct ? current.combo + 1 : correct === null ? current.combo : 0;
            return { ...current, results: [...current.results, correct], combo, bestCombo: Math.max(current.bestCombo, combo) };
        });
    }

    /** A new question from the lesson's own list: note the move on the ladder. */
    function recordMainQuestion(question: ClientQuestion | undefined) {
        if (!question) return;
        setGame((current) => ({ ...current, trend: trendBetween(current.lastDifficulty, question.difficulty), lastDifficulty: question.difficulty }));
    }

    async function startQuiz(currentUser: User, retryOf?: string) {
        setLoading(true);
        setError("");
        setQuiz(null);
        setResult(null);
        setNextLesson(null);
        setRemedial(null);
        setMisconception(null);
        setPractice(null);
        setFoundation(null);
        setFoundationResult(null);
        setLastAnswer(null);
        setGame(FRESH_GAME);
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
            if (!response.ok) {
                // A lesson without practice questions yet, or one still locked, explains itself instead of failing.
                if (data.code === "no_questions" || data.code === "locked") {
                    setError(data.error);
                    return;
                }
                throw new Error(data.error);
            }
            // A fresh session invalidates anything still queued from an abandoned one.
            clearSessionQueue(data.session.id);
            setPendingCount(0);
            setOfflineFinished(false);
            setQuiz(data.session);
            setGame({ ...FRESH_GAME, lastDifficulty: data.session.question?.difficulty ?? null });
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
        // Practice and foundation answers never count on the path or the combo.
        const onMainQuestion = !practice && !foundation;
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
                setGame((current) => ({ ...current, hints: current.hints + 1 }));
                setQuiz({ ...quiz, score: data.score });
                return;
            }
            if (action === "answer" && onMainQuestion && typeof data.isCorrect === "boolean") recordMainAnswer(data.isCorrect);
            if (data.completed) {
                // The last answer counts too, so the result shows the final score.
                setQuiz({ ...quiz, score: typeof data.score === "number" ? data.score : quiz.score });
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
                // A previous-class round, when offered, is announced on the review screen.
                setFoundation(data.foundation ?? null);
                setQuiz({ ...quiz, score: data.score });
                return;
            }

            // Next main question, the next practice item, or the next question of a foundation round.
            setLastAnswer(action === "answer" && typeof data.isCorrect === "boolean"
                ? { isCorrect: data.isCorrect, explanation: data.explanation, mistake: data.mistake }
                : null);
            setPractice(data.status === "misconception_practice" ? data.practice ?? null : null);
            setFoundation(data.status === "foundation_practice" ? data.foundation ?? null : null);
            setFoundationResult(data.foundationResult ?? null);
            if (data.status === "active") recordMainQuestion(data.question);
            setQuiz({ ...quiz, question: data.question, questionNumber: data.questionNumber ?? quiz.questionNumber, score: data.score });
            setRemedial(null);
            resetQuestionState();
            if (data.status !== "misconception_practice") setMisconception(null);
        } catch (caught) {
            // fetch only throws when the request never reached the server. Practice and
            // foundation questions are not in the local list, so they are not answered offline.
            if (action === "answer" && caught instanceof TypeError && quiz.question && !practice && !foundation) {
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
        recordMainAnswer(null);

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
        setFoundation(session.foundation ?? null);
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
        <main className="flex min-h-screen items-center justify-center bg-[#F4F6FB] p-4 font-body text-slate-900">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center">
                <CloudOff className="mx-auto mb-3 h-12 w-12 text-amber-500" />
                <h1 className="font-display text-2xl font-semibold">All questions answered offline</h1>
                <p className="mt-1 text-slate-600">Reconnect to submit them and see your result.</p>
                <p className="mt-4 text-sm font-bold">{pendingCount} {pendingCount === 1 ? "answer" : "answers"} waiting to sync</p>
                <div className="mt-5 grid gap-3">
                    <Button size="lg" className="h-12 rounded-2xl text-base font-extrabold" onClick={() => user && flushQueue(user, quiz.id)} disabled={syncing}>
                        <RefreshCw className={"mr-2 h-4 w-4 " + (syncing ? "animate-spin" : "")} />{syncing ? "Syncing your answers..." : "Sync now"}
                    </Button>
                    <Button variant="outline" size="lg" className="h-12 rounded-2xl text-base font-bold" asChild><Link href="/dashboard">Dashboard</Link></Button>
                </div>
            </div>
        </main>
    );

    if (result && quiz) {
        const right = quiz.score;
        const unlocked = result.mastered && nextLesson && nextLesson.microTag !== quiz.microTag ? nextLesson : null;
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#F4F6FB] p-4 font-body text-slate-900">
                <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 text-center md:p-8">
                    <PiMascot mood={result.mastered ? "cheer" : "happy"} size={96} className="mx-auto" />
                    <h1 className="mt-3 font-display text-3xl font-bold">{result.mastered ? say(language, "Well done!", "Shabash!") : say(language, "Good effort!", "Achhi koshish!")}</h1>
                    <p className="mt-1 text-base font-bold text-slate-600">
                        {result.mastered ? say(language, "Lesson mastered", "Lesson mukammal: mastered") : say(language, "Not mastered yet. One more try and you have it.", "Abhi mastered nahi. Ek aur koshish, phir ho jayega.")}
                    </p>

                    <div className="mx-auto my-6 flex h-40 w-40 items-center justify-center rounded-full" style={{ background: `conic-gradient(${result.mastered ? "#15803D" : "#4F46E5"} ${Math.max(0, Math.min(100, result.percentage)) * 3.6}deg, #E6E8F0 0)` }} role="img" aria-label={`${result.percentage} percent`}>
                        <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white">
                            <span className={`font-display text-4xl font-bold ${result.mastered ? "text-emerald-700" : "text-indigo-700"}`}>{result.percentage}%</span>
                            <span className="text-xs font-bold text-slate-500">{right} of {quiz.totalQuestions} right</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-2xl bg-indigo-50 p-3">
                            <p className="font-display text-2xl font-bold text-indigo-900">+{result.xpEarned ?? 0}</p>
                            <p className="text-xs font-extrabold text-indigo-800">XP</p>
                            {typeof result.totalXp === "number" ? <p className="text-[11px] font-bold text-indigo-700">Total {result.totalXp}</p> : null}
                        </div>
                        <div className="rounded-2xl bg-orange-50 p-3">
                            <p className="flex items-center justify-center gap-1 font-display text-2xl font-bold text-orange-900"><Flame className="h-5 w-5" />{result.streak ?? 0}</p>
                            <p className="text-xs font-extrabold text-orange-800">day streak</p>
                        </div>
                        <div className="rounded-2xl bg-amber-50 p-3">
                            <p className="font-display text-2xl font-bold text-amber-900">x{Math.max(game.bestCombo, 0)}</p>
                            <p className="text-xs font-extrabold text-amber-800">best combo</p>
                        </div>
                    </div>
                    {result.xpEarned === 0 ? <p className="mt-2 text-xs font-bold text-slate-500">{say(language, "A retry or a repeat today earns no XP, but mastery still counts.", "Dobara koshish ya aaj ka repeat XP nahi deta, lekin mastery ginti hai.")}</p> : null}

                    {result.newBadges?.length ? (
                        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-left">
                            <p className="mb-2 flex items-center gap-2 text-sm font-extrabold text-emerald-800"><Sparkles className="h-4 w-4" />New badges</p>
                            <ul className="space-y-1">
                                {result.newBadges.map((badge) => (
                                    <li key={badge.id} className="flex items-center gap-2 text-sm text-emerald-900">
                                        <Award className="h-4 w-4 shrink-0" />
                                        <span className="font-bold">{badge.title}</span>
                                        <span className="text-emerald-700">· {badge.description}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {unlocked ? (
                        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-teal-700 p-4 text-left text-white">
                            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20"><LockOpen className="h-5 w-5" /></span>
                            <div>
                                <p className="text-[11px] font-extrabold uppercase opacity-90">Unlocked</p>
                                <p className="font-bold">{unlocked.title}</p>
                            </div>
                        </div>
                    ) : null}

                    <div className="mt-6 grid gap-3">
                        {unlocked ? (
                            <Button size="lg" className="h-13 rounded-2xl text-base font-extrabold" asChild>
                                <Link href={`/learn?microTag=${encodeURIComponent(unlocked.microTag)}&class=${quiz.classLevel ?? ""}`}>{say(language, "Start the next lesson", "Agla lesson shuru karo")}<ArrowRight className="ml-2 h-5 w-5" /></Link>
                            </Button>
                        ) : (
                            <Button size="lg" className="h-13 rounded-2xl text-base font-extrabold" asChild><Link href="/dashboard">Dashboard</Link></Button>
                        )}
                        <Button variant="outline" size="lg" className="h-12 rounded-2xl text-base font-bold" onClick={() => user && startQuiz(user, quiz.id)}>
                            <RotateCcw className="mr-2 h-4 w-4" />{!result.mastered ? say(language, "Try again", "Dobara koshish") : result.percentage >= 100 ? say(language, "Play again", "Dobara khelo") : say(language, "Play again for 100%", "Dobara khelo, 100% ke liye")}
                        </Button>
                        {unlocked ? <Button variant="ghost" asChild><Link href="/dashboard">Dashboard</Link></Button> : null}
                    </div>
                </div>
            </main>
        );
    }

    if (loading && !quiz) return <div className="flex min-h-screen items-center justify-center bg-[#F4F6FB] font-body"><p className="font-bold text-slate-600">Preparing quiz...</p></div>;

    if (remedial && quiz) return (
        <main className="min-h-screen bg-[#F4F6FB] p-4 font-body text-slate-900 md:p-8">
            <div className="mx-auto max-w-5xl">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="text-sm font-extrabold text-slate-500">Question {quiz.questionNumber} of {quiz.totalQuestions}</span>
                    <LanguageSwitch value={language} onChange={chooseLanguage} />
                </div>
                <PiSays mood="oops">
                    {say(language, "No problem. See where it slipped, then the next one.", "Koi baat nahi. Dekho kahan phisle, phir agla sawal.")}
                </PiSays>
                <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
                    <ConceptGraphic imageUrl={remedial.imageUrl} alt={remedial.title.english} />
                    <div className="space-y-4 p-4 md:p-6">
                        <div>
                            <span className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-2.5 py-1 text-xs font-extrabold text-indigo-800"><HelpCircle className="h-3 w-3" />Review this foundation</span>
                            <h1 className="mt-2 font-display text-2xl font-semibold">{remedial.title.english}</h1>
                        </div>
                        <div className="grid gap-4 lg:grid-cols-3">
                            {mistake ? (
                                <InsightBlock tone="wrong" icon={<XCircle className="h-4 w-4" />}
                                    title={<>Why that answer is wrong<span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold normal-case tracking-normal">{MISTAKE_TYPE_LABELS[mistake.type].english}</span></>}>
                                    <BilingualText text={mistake.whyWrong} prompt="Read the reason in" switcher={false} />
                                </InsightBlock>
                            ) : null}
                            {explanation ? (
                                <InsightBlock tone="explain" icon={<Lightbulb className="h-4 w-4" />} title="Step-by-step solution">
                                    <BilingualText text={explanation} prompt="Read the solution in" switcher={false} />
                                </InsightBlock>
                            ) : null}
                            <InsightBlock tone="concept" icon={<HelpCircle className="h-4 w-4" />} title="The idea again">
                                <BilingualText text={remedial.concept} prompt="Read the concept in" switcher={false} />
                            </InsightBlock>
                        </div>
                        {misconception ? (
                            <InsightBlock tone="repeat" icon={<AlertTriangle className="h-4 w-4" />} title="This mistake keeps coming back">
                                <p className="mb-2">You have made this kind of mistake a few times on this concept. Here is the idea again, then a short set of practice questions.</p>
                                {misconceptionFitsTopic(misconception.tag, misconception.microTag)
                                    ? <BilingualText text={misconception.guidance} className="font-medium" prompt="Read the tip in" switcher={false} />
                                    : null}
                            </InsightBlock>
                        ) : null}
                        {foundation ? (
                            <InsightBlock tone="concept" icon={<Layers className="h-4 w-4" />} title={`First, a short round of Class ${foundation.classLevel} ${foundation.title.english}`}>
                                This topic builds on what Class {foundation.classLevel} taught. Answer {foundation.total} questions from there; get {foundation.passMark} right and you come back to your Class {quiz.classLevel ?? ""} questions. Your class and your score do not change.
                            </InsightBlock>
                        ) : null}
                        <div className="flex justify-end">
                            <Button size="lg" className="h-13 w-full rounded-2xl text-base font-extrabold sm:w-auto sm:px-8" onClick={() => evaluate("remedialComplete")} disabled={loading}>
                                {foundation ? `Start the Class ${foundation.classLevel} round` : misconception ? "Start targeted practice" : say(language, "Got it, next", "Samajh gaya, agay")}<ArrowRight className="ml-2 h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );

    const question = quiz?.question;
    const right = game.results.filter((item) => item === true).length;
    const wrong = game.results.filter((item) => item === false).length;
    const mood: PiMood = hint ? "think" : lastAnswer?.isCorrect ? "cheer" : lastAnswer && !lastAnswer.isCorrect ? "oops" : "happy";
    const piLine = hint
        ? say(language, "The hint is here. Read it, then choose.", "Hint aa gaya. Parho, phir chuno.")
        : foundation
            ? say(language, `Class ${foundation.classLevel} round. Take your time, this one is just practice.`, `Class ${foundation.classLevel} ka round. Aaram se, yeh sirf practice hai.`)
            : practice
                ? say(language, "Practice question. It does not count; it helps.", "Practice sawal. Score mein nahi ginta, madad karta hai.")
                : lastAnswer?.isCorrect && game.combo >= 2
                    ? say(language, `${game.combo} in a row! Keep the combo going.`, `${game.combo} lagatar sahi! Combo chalta rakho.`)
                    : lastAnswer?.isCorrect
                        ? say(language, "Correct! On to the next one.", "Sahi! Ab agla.")
                        : game.trend === "up"
                            ? say(language, "Right answers, so a bit harder now. You can do it.", "Sahi jawab, is liye ab thora mushkil. Tum kar sakte ho.")
                            : game.trend === "down"
                                ? say(language, "A little easier this time, then we climb again.", "Is baar thora asaan, phir upar chalenge.")
                                : say(language, "Read the question slowly. You have this.", "Sawal aaram se parho. Tum kar lo ge.");

    return (
        <div className="min-h-screen bg-[#F4F6FB] font-body text-slate-900">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
                    <Button variant="ghost" className="px-2 font-bold sm:px-4" asChild>
                        <Link href="/dashboard" aria-label="Exit quiz"><ArrowLeft className="h-4 w-4 sm:mr-2" /><span className="hidden sm:inline">Exit quiz</span></Link>
                    </Button>
                    {quiz ? (
                        <div className="flex items-center gap-2">
                            <ComboChip combo={game.combo} />
                            <ScoreChip score={quiz.score} />
                            <LanguageSwitch value={language} onChange={chooseLanguage} />
                        </div>
                    ) : null}
                </div>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-6">
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

                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <section className="min-w-0">
                        {foundation ? (
                            <InsightBlock tone="concept" className="mb-4" icon={<Layers className="h-4 w-4" />}
                                title={`Class ${foundation.classLevel} ${foundation.title.english} · question ${foundation.number} of ${foundation.total}${foundation.maxRounds > 1 ? ` · round ${foundation.round} of ${foundation.maxRounds}` : ""}`}>
                                Get {foundation.passMark} of {foundation.total} right to return to your Class {quiz?.classLevel ?? ""} questions. These do not count towards your score.
                            </InsightBlock>
                        ) : null}
                        {foundationResult ? (
                            <InsightBlock tone={foundationResult.outcome === "passed" ? "correct" : "concept"} className="mb-4" icon={<Layers className="h-4 w-4" />}
                                title={foundationResult.outcome === "passed" ? `Well done: Class ${foundationResult.classLevel} ${foundationResult.title.english} is solid.` : `The Class ${foundationResult.classLevel} round is over.`}>
                                {foundationResult.outcome === "passed"
                                    ? `Back to your Class ${quiz?.classLevel ?? ""} questions.`
                                    : `Keep going with your Class ${quiz?.classLevel ?? ""} questions. If ${foundationResult.title.english} still feels hard, ask your teacher for help.`}
                            </InsightBlock>
                        ) : null}
                        {practice ? (
                            <InsightBlock tone="repeat" className="mb-4" icon={<Target className="h-4 w-4" />}
                                title={practice.isRecheck ? "Re-check question" : `Targeted practice ${practice.number} / ${practice.total}`}>
                                {misconception ? `Extra practice for ${MISTAKE_TYPE_LABELS[misconception.type].english.toLowerCase()} mistakes on this topic.` : null}
                            </InsightBlock>
                        ) : null}
                        {lastAnswer ? (
                            lastAnswer.isCorrect ? (
                                <InsightBlock tone="correct" className="mb-4" icon={<CheckCircle2 className="h-4 w-4" />} title={<>Correct{!hint && !practice && !foundation ? <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold normal-case tracking-normal"><Star className="mr-1 inline h-3 w-3" />+1 XP</span> : null}</>}>
                                    {lastAnswer.explanation ? <BilingualText text={lastAnswer.explanation} prompt="Read the solution in" switcher={false} /> : null}
                                </InsightBlock>
                            ) : lastAnswer.mistake ? (
                                <InsightBlock tone="wrong" className="mb-4" icon={<XCircle className="h-4 w-4" />}
                                    title={<>Why that answer is wrong<span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-semibold normal-case tracking-normal">{MISTAKE_TYPE_LABELS[lastAnswer.mistake.type].english}</span></>}>
                                    <BilingualText text={lastAnswer.mistake.whyWrong} prompt="Read the reason in" switcher={false} />
                                </InsightBlock>
                            ) : null
                        ) : null}

                        {quiz && question ? (
                            <>
                                <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
                                    <QuestionPath total={quiz.totalQuestions} current={quiz.questionNumber} results={game.results} />
                                    {!practice && !foundation ? <DifficultyLadder current={question.difficulty} trend={game.trend} className="mt-4" /> : null}
                                </div>
                                <PiSays mood={mood} className="mb-4 lg:hidden">{piLine}</PiSays>
                                <div className="rounded-3xl border border-slate-200 bg-white p-5 md:p-7">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-sm font-extrabold text-slate-500">Question {quiz.questionNumber} of {quiz.totalQuestions}</span>
                                        <span className="rounded-xl bg-slate-100 px-2.5 py-1 text-xs font-extrabold capitalize text-slate-600">{question.difficulty}</span>
                                    </div>
                                    <h2 className="mt-3 break-words font-display text-2xl font-semibold leading-snug md:text-3xl md:leading-snug">{question.question}</h2>
                                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                                        {question.options.map((option) => (
                                            <OptionTile key={option.id} letter={option.id} text={option.text} selected={selected === option.id} disabled={loading} onClick={() => setSelected(option.id)} />
                                        ))}
                                    </div>
                                    {hint ? (
                                        <InsightBlock tone="hint" className="mt-4" icon={<Lightbulb className="h-4 w-4" />} title="Hint">
                                            <BilingualText text={hint} prompt="Read the hint in" switcher={false} />
                                        </InsightBlock>
                                    ) : null}
                                    <div className="mt-6 flex flex-wrap gap-3">
                                        <Button variant="outline" size="lg" className="h-14 rounded-2xl px-5 text-base font-extrabold" onClick={() => evaluate("hint")} disabled={loading || !!hint}>
                                            <Lightbulb className="mr-2 h-5 w-5" />Hint
                                        </Button>
                                        <Button size="lg" className="h-14 flex-1 rounded-2xl text-base font-extrabold" onClick={() => evaluate("answer")} disabled={!selected || loading}>
                                            Check answer<CheckCircle2 className="ml-2 h-5 w-5" />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        ) : <Button onClick={() => user && startQuiz(user)}>Try again</Button>}
                    </section>

                    {quiz && question ? (
                        <aside className="hidden space-y-4 lg:block">
                            <PiSays mood={mood}>{piLine}</PiSays>
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-extrabold uppercase text-slate-500">Combo</span>
                                    <span className="font-display text-2xl font-bold text-indigo-700">x{game.combo}</span>
                                </div>
                                <div className="mt-2 grid grid-cols-5 gap-1.5">
                                    {Array.from({ length: 5 }, (_, index) => <span key={index} className={`h-3 rounded-full ${index < Math.min(game.combo, 5) ? "bg-indigo-600" : "bg-slate-200"}`} />)}
                                </div>
                                <p className="mt-2 text-xs font-bold text-slate-500">{say(language, "Right answers in a row. Best this quiz:", "Lagatar sahi jawab. Is quiz ka best:")} x{game.bestCombo}</p>
                            </div>
                            <QuizStats right={right} wrong={wrong} hints={game.hints} />
                        </aside>
                    ) : null}
                </div>
            </main>
        </div>
    );
}

export default function QuizPage() {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}><QuizContent /></Suspense>;
}

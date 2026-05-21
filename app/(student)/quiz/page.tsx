"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import confetti from "canvas-confetti";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
    ArrowRight,
    CheckCircle2,
    XCircle,
    Lightbulb,
    HelpCircle,
    LayoutDashboard,
    RotateCcw,
    Trophy,
    Timer
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface QuizQuestion {
    id: string;
    question: string;
    difficulty: string;
    options?: string[];
    hint: string;
    encouragement: string;
}

interface QuizState {
    sessionId: string;
    questions: QuizQuestion[];
    currentIndex: number;
    score: number;
    maxScore: number;
}

function QuizContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const topic = searchParams.get("topic") || "Math Quiz";
    const topicId = searchParams.get("topicId") || "";
    const classLevel = Number(searchParams.get("class")) || 5;

    const [user, setUser] = useState<User | null>(null);
    const [quiz, setQuiz] = useState<QuizState | null>(null);
    const [answer, setAnswer] = useState("");
    const [feedback, setFeedback] = useState("");
    const [feedbackType, setFeedbackType] = useState<"correct" | "wrong" | "hint" | "">("");
    const [hint, setHint] = useState("");
    const [levelNotification, setLevelNotification] = useState<{ direction: string, level: number } | null>(null);
    const [loading, setLoading] = useState(false);
    const [startingQuiz, setStartingQuiz] = useState(false);
    const [attemptNumber, setAttemptNumber] = useState(0);
    const [showNextButton, setShowNextButton] = useState(false);
    const [results, setResults] = useState<{
        score: number;
        maxScore: number;
        percentage: number;
        understandingLevel: string;
        feedback: string;
    } | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (!currentUser) {
                router.push("/login?role=student");
            } else {
                setUser(currentUser);
            }
        });
        return () => unsubscribe();
    }, [router]);

    const startQuiz = useCallback(async () => {
        if (!user || !topic) return;

        setStartingQuiz(true);
        setError("");

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/quiz", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    topicId,
                    topicName: topic,
                    classLevel,
                    questionCount: 5,
                }),
            });

            if (!response.ok) throw new Error("Failed to start quiz");

            const data = await response.json();

            if (data.session?.id && data.session?.questions) {
                setQuiz({
                    sessionId: data.session.id,
                    questions: data.session.questions,
                    currentIndex: 0,
                    score: 0,
                    maxScore: data.session.questions.length * 3,
                });
            } else {
                throw new Error("Invalid quiz data");
            }
        } catch (err) {
            console.error("Quiz start error:", err);
            setError("Could not start the quiz. Please try again.");
        } finally {
            setStartingQuiz(false);
        }
    }, [user, topic, topicId, classLevel]);

    // Initial Start
    useEffect(() => {
        if (user && topic && !quiz && !startingQuiz && !results) {
            startQuiz();
        }
    }, [user, topic, quiz, startingQuiz, results, startQuiz]);

    const triggerConfetti = () => {
        const duration = 3 * 1000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function () {
            const timeLeft = animationEnd - Date.now();

            if (timeLeft <= 0) {
                return clearInterval(interval);
            }

            const particleCount = 50 * (timeLeft / duration);
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
            confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);
    };

    const submitAnswer = async (selectedOption?: string) => {
        if (!user || !quiz) return;

        const finalAnswer = selectedOption || answer;
        if (!finalAnswer.trim()) return;

        // If generic input, update state
        if (selectedOption) setAnswer(selectedOption);

        const currentQuestion = quiz.questions[quiz.currentIndex];
        setLoading(true);
        setError("");

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/evaluate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    sessionId: quiz.sessionId,
                    questionId: currentQuestion.id,
                    answer: finalAnswer.trim(),
                    timeTakenSeconds: 30, // Mock time for now or add timer later
                }),
            });

            const data = await response.json();

            setFeedback(data.feedback || "");
            setAttemptNumber(data.attemptNumber || attemptNumber + 1);

            if (data.levelChanged) {
                setLevelNotification({ direction: data.direction, level: data.newLevel });
                setTimeout(() => setLevelNotification(null), 6000);
            }

            if (data.isCorrect) {
                setFeedbackType("correct");
                setShowNextButton(true);
                setQuiz((prev) =>
                    prev ? { ...prev, score: prev.score + (data.score || 1) } : prev
                );
                // Mini confetti for correct answer
                confetti({
                    particleCount: 100,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            } else {
                setFeedbackType("wrong");
                if (data.hint) {
                    setHint(data.hint);
                }

                if (data.shouldMoveNext) {
                    setShowNextButton(true);
                }
            }

            // Check if quiz is completed
            if (data.quizComplete && data.result) {
                setResults(data.result);
                if (data.result.percentage >= 70) {
                    triggerConfetti();
                }
            }
        } catch (err) {
            console.error("Submit error:", err);
            setError("Something went wrong. Please try submitting again.");
        } finally {
            setLoading(false);
        }
    };

    const requestHint = async () => {
        if (!user || !quiz) return;

        const currentQuestion = quiz.questions[quiz.currentIndex];
        setLoading(true);

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/evaluate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    sessionId: quiz.sessionId,
                    questionId: currentQuestion.id,
                    requestHint: true,
                }),
            });

            const data = await response.json();
            if (data.hint) {
                setHint(data.hint);
                setFeedbackType("hint");
            }
        } catch (err) {
            console.error("Hint error:", err);
        } finally {
            setLoading(false);
        }
    };

    const nextQuestion = () => {
        if (!quiz) return;

        const nextIndex = quiz.currentIndex + 1;
        if (nextIndex < quiz.questions.length) {
            setQuiz({ ...quiz, currentIndex: nextIndex });
            setAnswer("");
            setFeedback("");
            setFeedbackType("");
            setHint("");
            setAttemptNumber(0);
            setShowNextButton(false);
        }
    };

    const maxAttempts = 3;

    // Results View
    if (results) {
        const levelConfig: Record<string, { color: string; bg: string; icon: any }> = {
            EXCELLENT: { color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30", icon: Trophy },
            GOOD: { color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30", icon: CheckCircle2 },
            AVERAGE: { color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30", icon: Lightbulb },
            WEAK: { color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-900/30", icon: HelpCircle },
        };
        const config = levelConfig[results.understandingLevel] || levelConfig.AVERAGE;
        const Icon = config.icon;

        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
                <Card className="w-full max-w-md text-center border-t-8 border-t-primary shadow-2xl relative overflow-hidden">
                    {/* Decorative bg */}
                    <div className={`absolute inset-0 opacity-5 pointer-events-none ${config.bg}`} />

                    <CardHeader className="pt-12 pb-2">
                        <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-6 ring-8 ring-white dark:ring-slate-900 shadow-xl ${config.bg} ${config.color}`}>
                            <Icon className="w-12 h-12" />
                        </div>
                        <CardTitle className="text-3xl font-bold">Quiz Complete!</CardTitle>
                        <p className="text-muted-foreground font-medium">{topic}</p>
                    </CardHeader>

                    <CardContent className="space-y-8">
                        <div>
                            <div className="text-5xl font-black tracking-tight text-primary">
                                {results.percentage}%
                            </div>
                            <Badge variant="outline" className={`mt-2 ${config.color} border-current`}>
                                {results.understandingLevel}
                            </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                                <span className="block text-muted-foreground text-xs uppercase font-bold">Score</span>
                                <span className="font-semibold text-lg">{results.score}/{results.maxScore}</span>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-lg">
                                <span className="block text-muted-foreground text-xs uppercase font-bold">Questions</span>
                                <span className="font-semibold text-lg">{quiz?.questions.length}</span>
                            </div>
                        </div>

                        {results.feedback && (
                            <Alert className="bg-primary/5 border-primary/20 text-left">
                                <Lightbulb className="h-4 w-4 text-primary" />
                                <AlertTitle className="text-primary font-bold">Feedback</AlertTitle>
                                <AlertDescription className="text-muted-foreground text-xs leading-relaxed mt-1">
                                    {results.feedback}
                                </AlertDescription>
                            </Alert>
                        )}
                    </CardContent>

                    <CardFooter className="flex flex-col gap-3 pb-8">
                        <Button className="w-full" size="lg" onClick={() => { setResults(null); setQuiz(null); }}>
                            <RotateCcw className="mr-2 h-4 w-4" /> Try Again
                        </Button>
                        <Button variant="outline" className="w-full" asChild>
                            <Link href="/dashboard">
                                <LayoutDashboard className="mr-2 h-4 w-4" /> Dashboard
                            </Link>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    // Loading State
    if (startingQuiz || !quiz) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
                <div className="text-center space-y-6 max-w-sm">
                    <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-800" />
                        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Preparing Quiz...</h2>
                        <p className="text-muted-foreground text-sm mt-2">Getting your questions ready based on {topic}</p>
                    </div>
                    {error && (
                        <div className="space-y-4">
                            <Alert variant="destructive">
                                <XCircle className="h-4 w-4" />
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                            <Button onClick={startQuiz} variant="outline" size="sm">Try Again</Button>
                            <Link href="/dashboard">
                                <Button variant="link" size="sm" className="text-muted-foreground">Cancel</Button>
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const currentQuestion = quiz.questions[quiz.currentIndex];
    const progressPercentage = ((quiz.currentIndex + (feedbackType ? 1 : 0)) / quiz.questions.length) * 100;
    const isLastQuestion = quiz.currentIndex === quiz.questions.length - 1;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {/* Header */}
            <header className="bg-white dark:bg-slate-900 border-b sticky top-0 z-10 shadow-sm">
                <div className="container max-w-2xl mx-auto px-4 py-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <Button variant="ghost" size="sm" className="text-muted-foreground" asChild>
                            <Link href="/dashboard">Exit Quiz</Link>
                        </Button>
                        <div className="font-semibold text-sm">
                            Question {quiz.currentIndex + 1} of {quiz.questions.length}
                        </div>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                </div>
            </header>

            <main className="flex-1 container max-w-2xl mx-auto px-4 py-8">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentQuestion.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="flex justify-between items-start mb-6">
                            <Badge variant="outline" className="uppercase tracking-wide text-xs font-bold text-muted-foreground border-slate-300 dark:border-slate-700">
                                {currentQuestion.difficulty}
                            </Badge>
                            {attemptNumber > 0 && (
                                <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                    Attempt {attemptNumber}/{maxAttempts}
                                </Badge>
                            )}
                        </div>

                        <Card className="mb-8 border-none shadow-lg">
                            <CardContent className="pt-6">
                                <h2 className="text-xl font-medium leading-relaxed">
                                    {currentQuestion.question}
                                </h2>
                            </CardContent>
                        </Card>

                        <div className="space-y-4 mb-8">
                            {currentQuestion.options && currentQuestion.options.length > 0 ? (
                                <div className="grid grid-cols-1 gap-3">
                                    {currentQuestion.options.map((option, i) => {
                                        const isSelected = answer === option;

                                        return (
                                            <Button
                                                key={i}
                                                variant="outline"
                                                className={`h-auto py-4 px-4 justify-start text-left text-base whitespace-normal relative overflow-hidden transition-all duration-200 ${isSelected
                                                    ? "border-primary bg-primary/5 ring-1 ring-primary text-foreground"
                                                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    }`}
                                                onClick={() => submitAnswer(option)}
                                                disabled={showNextButton || loading}
                                            >
                                                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold mr-4 border transition-colors ${isSelected
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-slate-100 dark:bg-slate-800 text-muted-foreground border-slate-200 dark:border-slate-700"
                                                    }`}>
                                                    {String.fromCharCode(65 + i)}
                                                </span>
                                                {option}
                                            </Button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        placeholder="Type your answer..."
                                        value={answer}
                                        onChange={(e) => setAnswer(e.target.value)}
                                        disabled={showNextButton}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && !showNextButton) submitAnswer();
                                        }}
                                        autoFocus
                                    />
                                    <Button size="lg" onClick={() => submitAnswer()} disabled={!answer.trim() || loading}>
                                        Submit
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Feedback Area */}
                        <AnimatePresence>
                            {feedback && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-6"
                                >
                                    <Alert variant={feedbackType === "correct" ? "default" : "destructive"} className={`border-l-4 ${feedbackType === "correct"
                                        ? "border-l-emerald-500 bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/20 dark:border-emerald-900 dark:text-emerald-300"
                                        : "border-l-amber-500 bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-300"
                                        }`}>
                                        {feedbackType === "correct" ? <CheckCircle2 className="h-5 w-5" /> : <Lightbulb className="h-5 w-5" />}
                                        <AlertTitle className="ml-2 font-bold text-lg">
                                            {feedbackType === "correct" ? "Correct!" : "Nice try!"}
                                        </AlertTitle>
                                        <AlertDescription className="ml-2 mt-2 text-base leading-relaxed">
                                            {feedback}
                                        </AlertDescription>
                                    </Alert>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Hint */}
                        <AnimatePresence>
                            {hint && feedbackType !== "correct" && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-6"
                                >
                                    <Alert className="bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/20 dark:border-blue-900 dark:text-blue-300">
                                        <HelpCircle className="h-4 w-4" />
                                        <AlertTitle className="ml-2 font-semibold">Hint</AlertTitle>
                                        <AlertDescription className="ml-2">{hint}</AlertDescription>
                                    </Alert>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Level Notification */}
                        <AnimatePresence>
                            {levelNotification && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="mb-6"
                                >
                                    <Alert className={levelNotification.direction === "up" 
                                        ? "bg-indigo-50 border-indigo-200 text-indigo-900 border-l-4 border-l-indigo-500 shadow-md" 
                                        : "bg-orange-50 border-orange-200 text-orange-900 border-l-4 border-l-orange-500 shadow-md"}>
                                        <Trophy className="h-6 w-6" />
                                        <AlertTitle className="ml-3 font-bold text-lg">
                                            {levelNotification.direction === "up" ? "Level Up! 🎉" : "Level Adjusted Checkpoint"}
                                        </AlertTitle>
                                        <AlertDescription className="ml-3 mt-1 text-base">
                                            {levelNotification.direction === "up" 
                                                ? `Amazing streak! You've been promoted to Level ${levelNotification.level}!` 
                                                : `No worries! We've adjusted your questions to Level ${levelNotification.level} to help you build confidence.`}
                                        </AlertDescription>
                                    </Alert>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Footer Actions */}
                        <div className="flex justify-between items-center pt-8 border-t">
                            <div>
                                {!showNextButton && !feedbackType && (
                                    <Button variant="ghost" size="sm" onClick={requestHint} disabled={loading || !!hint} className="text-muted-foreground gap-2">
                                        <Lightbulb className="h-4 w-4" /> Need a hint?
                                    </Button>
                                )}
                            </div>

                            <div>
                                {showNextButton && (
                                    <Button size="lg" onClick={nextQuestion} className="gap-2 pl-8 pr-8 shadow-lg shadow-primary/20">
                                        {isLastQuestion ? "Finish Quiz" : "Next Question"} <ArrowRight className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>

                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
}

export default function QuizPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <QuizContent />
        </Suspense>
    );
}

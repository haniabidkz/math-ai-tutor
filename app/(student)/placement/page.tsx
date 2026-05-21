"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import confetti from "canvas-confetti";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { XCircle, ArrowRight, Target, LayoutDashboard, BrainCog } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { StudentProfile } from "@/types/user";

interface PlacementQuestion {
    id: string;
    question: string;
    difficulty: string;
    options?: string[];
}

function PlacementContent() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [classLevel, setClassLevel] = useState<number>(5);
    const [questions, setQuestions] = useState<PlacementQuestion[]>([]);
    const [sessionId, setSessionId] = useState<string>("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    
    // States
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [result, setResult] = useState<{ assigned_level: number, score: number, total: number } | null>(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                router.push("/login?role=student");
                return;
            }
            setUser(currentUser);
            
            try {
                const profileDoc = await getDoc(doc(db, "students", currentUser.uid));
                if (profileDoc.exists()) {
                    const profileData = profileDoc.data() as StudentProfile;
                    if (profileData.placementCompleted) {
                        router.push("/dashboard");
                        return;
                    }
                    setClassLevel(profileData.class || 5);
                }
                startTest(currentUser, profileDoc.exists() ? (profileDoc.data() as StudentProfile).class || 5 : 5);
            } catch (err) {
                console.error(err);
                setError("Failed to load profile.");
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, [router]);

    const startTest = async (currentUser: User, studentClass: number) => {
        try {
            const token = await currentUser.getIdToken();
            const response = await fetch("/api/placement", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ classLevel: studentClass })
            });

            if (!response.ok) throw new Error("Failed to start placement test");
            
            const data = await response.json();
            if (data.success) {
                setQuestions(data.questions);
                setSessionId(data.sessionId);
            } else {
                throw new Error(data.error || "Unknown error");
            }
        } catch (err: any) {
            console.error("Start test error:", err);
            setError(err.message || "Failed to start. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelectOption = (option: string) => {
        setAnswers({
            ...answers,
            [questions[currentIndex].id]: option
        });
    };

    const handleNext = () => {
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(currentIndex + 1);
        } else {
            submitTest();
        }
    };

    const submitTest = async () => {
        if (!user || !sessionId) return;
        setSubmitting(true);
        setError("");

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/placement", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ sessionId, answers })
            });

            const data = await response.json();
            if (data.success) {
                setResult(data);
                confetti({
                    particleCount: 150,
                    spread: 80,
                    origin: { y: 0.6 }
                });
            } else {
                throw new Error(data.error);
            }
        } catch (err: any) {
            console.error("Submit error:", err);
            setError("Failed to submit test. Please try again.");
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
                <div className="text-center space-y-6 max-w-sm">
                    <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-800" />
                        <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Preparing Placement Test...</h2>
                        <p className="text-muted-foreground text-sm mt-2">Getting questions ready to find your starting level.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error && !questions.length) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
                <div className="text-center space-y-6 max-w-sm">
                    <Alert variant="destructive">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                    <Button onClick={() => { setLoading(true); setError(""); user && startTest(user, classLevel); }}>Try Again</Button>
                </div>
            </div>
        );
    }

    if (result) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
                <Card className="w-full max-w-md text-center border-t-8 border-t-primary shadow-2xl relative overflow-hidden">
                    <CardHeader className="pt-12 pb-2">
                        <div className="mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-6 ring-8 ring-white dark:ring-slate-900 shadow-xl bg-primary/10 text-primary">
                            <Target className="w-12 h-12" />
                        </div>
                        <CardTitle className="text-3xl font-bold">Level Assigned!</CardTitle>
                        <p className="text-muted-foreground font-medium mt-2">We've found the perfect starting point.</p>
                    </CardHeader>
                    <CardContent className="space-y-6 pt-4">
                        <div>
                            <div className="text-6xl font-black tracking-tight text-primary">
                                Level {result.assigned_level}
                            </div>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            Based on your test ({result.score}/{result.total} correct), we've customized your learning path.
                        </p>
                    </CardContent>
                    <CardFooter className="pb-8">
                        <Button className="w-full" size="lg" asChild>
                            <Link href="/dashboard">
                                <LayoutDashboard className="mr-2 h-4 w-4" /> Go to Dashboard
                            </Link>
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        );
    }

    const currentQuestion = questions[currentIndex];
    const hasAnswered = !!answers[currentQuestion.id];
    const progressPercentage = (currentIndex / questions.length) * 100;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            <header className="bg-white dark:bg-slate-900 border-b sticky top-0 z-10 shadow-sm">
                <div className="container max-w-2xl mx-auto px-4 py-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-primary font-bold">
                            <BrainCog className="h-5 w-5" />
                            Placement Test
                        </div>
                        <div className="font-semibold text-sm">
                            Question {currentIndex + 1} of {questions.length}
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
                                        const isSelected = answers[currentQuestion.id] === option;
                                        return (
                                            <Button
                                                key={i}
                                                variant="outline"
                                                className={`h-auto py-4 px-4 justify-start text-left text-base whitespace-normal transition-all duration-200 ${isSelected
                                                    ? "border-primary bg-primary/5 ring-1 ring-primary text-foreground"
                                                    : "hover:bg-slate-50 dark:hover:bg-slate-800"
                                                    }`}
                                                onClick={() => handleSelectOption(option)}
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
                                <div className="flex flex-col gap-2">
                                    <input
                                        type="text"
                                        className="flex h-12 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        placeholder="Type your answer..."
                                        value={answers[currentQuestion.id] || ""}
                                        onChange={(e) => handleSelectOption(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && hasAnswered) handleNext();
                                        }}
                                        autoFocus
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end pt-8 border-t">
                            <Button 
                                size="lg" 
                                onClick={handleNext} 
                                disabled={!hasAnswered || submitting} 
                                className="gap-2 pl-8 pr-8 shadow-lg"
                            >
                                {submitting ? "Submitting..." : currentIndex === questions.length - 1 ? "Finish Test" : "Next Question"} 
                                {!submitting && <ArrowRight className="h-4 w-4" />}
                            </Button>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
}

export default function PlacementPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <PlacementContent />
        </Suspense>
    );
}

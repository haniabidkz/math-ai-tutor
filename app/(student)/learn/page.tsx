"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TextToSpeech } from "@/components/tts-button";
import {
    ArrowLeft,
    Sparkles,
    CheckCircle2,
    HelpCircle,
    RotateCcw,
    BookOpen
} from "lucide-react";

import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";

function LearnContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const topic = searchParams.get("topic") || "Topic";
    const topicId = searchParams.get("topicId") || "";
    const classLevel = Number(searchParams.get("class")) || 5;

    const [user, setUser] = useState<User | null>(null);
    const [content, setContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [teachingLevel, setTeachingLevel] = useState<1 | 2 | 3>(1);
    const [language, setLanguage] = useState<"english" | "roman-urdu">("english");
    const [needsHumanAttention, setNeedsHumanAttention] = useState(false);
    const [understood, setUnderstood] = useState(false);
    const [error, setError] = useState("");

    // Auth check
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

    const fetchTeaching = useCallback(
        async (level?: 1 | 2 | 3) => {
            if (!user || !topic) return;

            setLoading(true);
            setError("");
            // Clear content slightly to show new loading state if switching levels, 
            // but keeps UX smoother if we just overlay loading. 
            // I'll clear it to prevent reading old text.
            setContent("");

            try {
                const token = await user.getIdToken();
                const response = await fetch("/api/teach", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        topic,
                        topicId,
                        classLevel,
                        teachingLevel: level || teachingLevel,
                        language,
                    }),
                });

                if (!response.ok) throw new Error("Failed to fetch explanation");

                const data = await response.json();

                if (data.needsHumanAttention) {
                    setNeedsHumanAttention(true);
                } else if (data.content) {
                    setContent(data.content);
                    if (level) setTeachingLevel(level); // Update level if explicitly requested
                }
            } catch (err) {
                console.error("Fetch error:", err);
                setError("Ouch! I couldn't think of an explanation right now. Please try again.");
            } finally {
                setLoading(false);
            }
        },
        [user, topic, topicId, classLevel, teachingLevel, language]
    );

    // Initial fetch
    useEffect(() => {
        if (user && topic) {
            fetchTeaching();
        }
    }, [user, topic, fetchTeaching]); // Added fetchTeaching dependency

    // Re-fetch on language change
    const handleLanguageChange = (val: string) => {
        setLanguage(val as "english" | "roman-urdu");
        // useEffect will trigger fetchTeaching due to dependency change? 
        // No, fetchTeaching is memoized on language. 
        // Actually, better to just call fetchTeaching manually or let a separate effect handle it.
        // The original code had a separate useEffect for language. I'll stick to manual call here for clarity or just let the effect below handle it.
    };

    // Effect to refetch when language changes
    useEffect(() => {
        if (user && topic && !loading) {
            fetchTeaching();
        }
    }, [language]);


    const handleUnderstood = async () => {
        if (!user) return;
        setUnderstood(true);

        try {
            const token = await user.getIdToken();
            await fetch("/api/teach", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    topicId,
                    understood: true,
                }),
            });

            // Delay redirect slightly for animation
            setTimeout(() => {
                router.push(`/quiz?topic=${encodeURIComponent(topic)}&topicId=${topicId}&class=${classLevel}`);
            }, 1500);
        } catch (err) {
            console.error("Update error:", err);
        }
    };

    const handleDidntUnderstand = async () => {
        if (!user) return;

        try {
            const token = await user.getIdToken();
            await fetch("/api/teach", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    topicId,
                    understood: false,
                }),
            });

            const nextLevel = Math.min(teachingLevel + 1, 3) as 1 | 2 | 3;
            if (nextLevel > teachingLevel) {
                fetchTeaching(nextLevel);
            } else {
                setNeedsHumanAttention(true);
            }
        } catch (err) {
            console.error("Update error:", err);
        }
    };

    const handleRestartTopic = async () => {
        if (!user || !topic) return;

        setLoading(true);
        setNeedsHumanAttention(false);

        try {
            const token = await user.getIdToken();
            const response = await fetch("/api/teach", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    topic,
                    topicId,
                    classLevel,
                    teachingLevel: 1,
                    language,
                    restart: true
                }),
            });

            if (!response.ok) throw new Error("Failed to restart topic");

            const data = await response.json();
            if (data.content) {
                setContent(data.content);
                setTeachingLevel(1);
            }
        } catch (err) {
            console.error("Restart error:", err);
            setError("Couldn't restart the topic right now. Please try again.");
            setNeedsHumanAttention(true); // Revert to help screen if restart fails
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
            {/* Header */}
            <header className="bg-white dark:bg-slate-900 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
                <div className="flex items-center gap-4">
                    <Link href="/dashboard">
                        <Button variant="ghost" size="icon" className="-ml-2">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <div>
                        <h1 className="font-semibold text-lg leading-tight flex items-center gap-2">
                            {topic}
                            <Badge variant="outline" className="font-normal text-xs">Class {classLevel}</Badge>
                        </h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Select value={language} onValueChange={handleLanguageChange}>
                        <SelectTrigger className="w-[140px] h-9 text-xs">
                            <SelectValue placeholder="Language" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="english">🇬🇧 English</SelectItem>
                            <SelectItem value="roman-urdu">🇵🇰 Roman Urdu</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </header>

            <main className="flex-1 container max-w-3xl mx-auto p-4 md:p-8 flex flex-col items-center">
                {/* Stepper */}
                <div className="w-full mb-8 relative">
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-200 dark:bg-slate-800 -translate-y-1/2 rounded-full -z-10" />
                    <div className="flex justify-between w-full max-w-md mx-auto relative z-0">
                        <div className="absolute top-1/2 left-0 w-full h-1 bg-indigo-100 dark:bg-indigo-900/30 -translate-y-1/2 -z-10" />

                        {[1, 2, 3].map((step) => {
                            const isActive = step === teachingLevel;
                            const isCompleted = step < teachingLevel;

                            return (
                                <div key={step} className="flex flex-col items-center gap-2 bg-slate-50 dark:bg-slate-950 px-2">
                                    <div
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${isActive
                                            ? "bg-primary text-primary-foreground scale-110 shadow-lg ring-4 ring-primary/20"
                                            : isCompleted
                                                ? "bg-primary/20 text-primary"
                                                : "bg-slate-200 text-slate-500 dark:bg-slate-800"
                                            }`}
                                    >
                                        {step}
                                    </div>
                                    <span className={`text-[10px] font-medium uppercase tracking-wider ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                                        {step === 1 ? "Basics" : step === 2 ? "Examples" : "Deep Dive"}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <AnimatePresence mode="wait">
                    {needsHumanAttention ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-xl"
                        >
                            <Alert variant="destructive" className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
                                <HelpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                <AlertTitle className="text-amber-800 dark:text-amber-400 text-lg">Let's get some help!</AlertTitle>
                                <AlertDescription className="text-amber-700 dark:text-amber-500 mt-2">
                                    I've tried my best, but this topic is a bit tricky!
                                    I've notified your teacher that you might need some extra guidance.
                                    Don't worry, they'll help you master this!
                                </AlertDescription>
                                <div className="mt-6 flex flex-wrap gap-3">
                                    <Link href="/dashboard">
                                        <Button variant="outline" className="border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-800">
                                            Return to Dashboard
                                        </Button>
                                    </Link>
                                    <Button
                                        onClick={handleRestartTopic}
                                        disabled={loading}
                                        className="bg-amber-600 hover:bg-amber-700 text-white"
                                    >
                                        Restart from Basics
                                    </Button>
                                </div>
                            </Alert>
                        </motion.div>
                    ) : understood ? (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center space-y-4 py-12"
                        >
                            <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-4xl animate-bounce">
                                🎉
                            </div>
                            <h2 className="text-2xl font-bold">Awesome Job!</h2>
                            <p className="text-muted-foreground">You've mastered this explanation. Getting your quiz ready...</p>
                        </motion.div>
                    ) : (
                        <Card className="w-full shadow-lg border-2 border-slate-100 dark:border-slate-800">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
                                <div className="space-y-1">
                                    <CardTitle className="text-xl flex items-center gap-2">
                                        <Sparkles className="h-5 w-5 text-primary" />
                                        AI Tutor Explanation
                                    </CardTitle>
                                    <p className="text-sm text-muted-foreground">
                                        Read carefully and listen if you prefer.
                                    </p>
                                </div>
                                <TextToSpeech text={content} />
                            </CardHeader>
                            <CardContent className="pt-6 min-h-[200px]">
                                {loading && !content ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-primary">
                                        <div className="relative">
                                            <Sparkles className="h-10 w-10 opacity-20 animate-ping absolute inset-0" />
                                            <Sparkles className="h-10 w-10 relative opacity-80 animate-pulse" />
                                        </div>
                                        <p className="mt-4 text-lg font-medium text-slate-500 animate-pulse">
                                            The AI Tutor is thinking...
                                        </p>
                                    </div>
                                ) : (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="prose prose-slate dark:prose-invert max-w-none leading-relaxed text-lg"
                                    >
                                        <ReactMarkdown>{content}</ReactMarkdown>
                                    </motion.div>
                                )}
                            </CardContent>
                            <CardFooter className="bg-slate-50 dark:bg-slate-900/50 p-6 flex flex-col sm:flex-row gap-3 border-t">
                                <Button
                                    size="lg"
                                    variant="outline"
                                    className="w-full sm:w-auto flex-1 gap-2"
                                    onClick={handleDidntUnderstand}
                                    disabled={loading || needsHumanAttention}
                                >
                                    <RotateCcw className="h-4 w-4" />
                                    Explain {teachingLevel === 3 ? "Again" : "Differently"}
                                </Button>
                                <Button
                                    size="lg"
                                    className="w-full sm:w-auto flex-[2] gap-2 shadow-lg shadow-indigo-500/20"
                                    onClick={handleUnderstood}
                                    disabled={loading || !content}
                                >
                                    <CheckCircle2 className="h-4 w-4" />
                                    I Understand!
                                </Button>
                            </CardFooter>
                        </Card>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}

export default function LearnPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
            <LearnContent />
        </Suspense>
    );
}

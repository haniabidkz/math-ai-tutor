"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowRight, CheckCircle2, Target, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { auth } from "@/lib/firebase";
import type { ClientQuestion } from "@/lib/assessment-content";
import type { DiagnosticProfile } from "@/types/assessment";

const BAND_STYLES: Record<string, string> = {
    strong: "bg-emerald-100 text-emerald-800",
    "needs-practice": "bg-amber-100 text-amber-800",
    weak: "bg-orange-100 text-orange-800",
    "very-weak": "bg-red-100 text-red-800",
};

export default function PlacementPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [sessionId, setSessionId] = useState("");
    const [question, setQuestion] = useState<ClientQuestion | null>(null);
    const [questionNumber, setQuestionNumber] = useState(1);
    const [totalQuestions, setTotalQuestions] = useState(15);
    const [selected, setSelected] = useState("");
    const [profile, setProfile] = useState<DiagnosticProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
        if (!currentUser) return router.replace("/login?role=student");
        setUser(currentUser);
        await start(currentUser);
    }), [router]);

    async function start(currentUser: User) {
        setLoading(true);
        setError("");
        try {
            // The class comes from the student's profile on the server.
            const response = await fetch("/api/placement", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
                body: JSON.stringify({}),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setSessionId(data.sessionId);
            setQuestion(data.question);
            setQuestionNumber(data.questionNumber);
            setTotalQuestions(data.totalQuestions);
        } catch {
            setError("The diagnostic could not start. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function submit() {
        if (!user || !question || !selected || submitting) return;
        setSubmitting(true);
        setError("");
        try {
            const response = await fetch("/api/placement", {
                method: "PATCH",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
                body: JSON.stringify({ sessionId, eventId: crypto.randomUUID(), questionId: question.id, optionId: selected }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            if (data.completed) setProfile(data.profile);
            else {
                setQuestion(data.question);
                setQuestionNumber(data.questionNumber);
                setSelected("");
            }
        } catch {
            setError("The diagnostic could not continue. Please try again.");
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="font-medium text-slate-600">Preparing your diagnostic...</p></div>;

    if (profile) {
        const learningUrl = `/learn?microTag=${encodeURIComponent(profile.recommendedMicroTag)}&class=${profile.assessedClassLevel}`;
        return (
            <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
                <Card className="w-full max-w-2xl rounded-lg border-t-4 border-t-emerald-500">
                    <CardHeader>
                        <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-600" />
                        <CardTitle>Your learning path is ready</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <div>
                            <span className="text-sm text-muted-foreground">Diagnostic score</span>
                            <p className="text-4xl font-bold">{profile.overallCorrect ?? 0} / {profile.overallTotal ?? totalQuestions}</p>
                        </div>
                        {profile.topicResults?.length ? (
                            <div className="grid gap-2 sm:grid-cols-5">
                                {profile.topicResults.map((topic) => (
                                    <div key={topic.topicKey} className="rounded-lg border p-3">
                                        <p className="text-xs font-semibold">{topic.title.english}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{topic.correct} / {topic.total}</p>
                                        <span className={`mt-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${BAND_STYLES[topic.band] ?? ""}`}>
                                            {topic.band.replace("-", " ")}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        <dl className="grid gap-4 border-y py-5 sm:grid-cols-2">
                            <div><dt className="text-sm text-muted-foreground">Math level</dt><dd className="mt-1 text-xl font-semibold">Class {profile.mathLevel}</dd></div>
                            <div><dt className="text-sm text-muted-foreground">Enrolled class</dt><dd className="mt-1 text-xl font-semibold">Class {profile.assessedClassLevel}</dd></div>
                            <div><dt className="text-sm text-muted-foreground">Weakest topic</dt><dd className="mt-1 font-semibold">{profile.weakTopic?.english ?? "No major weakness identified"}</dd></div>
                            <div><dt className="text-sm text-muted-foreground">Recommended starting topic</dt><dd className="mt-1 font-semibold">{profile.recommendedTopic.english}</dd></div>
                        </dl>
                    </CardContent>
                    <CardFooter>
                        <Button asChild size="lg" className="w-full">
                            <Link href={learningUrl}>Start learning {profile.recommendedTopic.english}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                        </Button>
                    </CardFooter>
                </Card>
            </main>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
                    <div>
                        <p className="font-semibold">Diagnostic Assessment</p>
                        <p className="text-xs text-muted-foreground">{questionNumber} / {totalQuestions}</p>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-4 py-8">
                <Progress aria-label={`${questionNumber} of ${totalQuestions} questions`} value={(questionNumber / totalQuestions) * 100} className="mb-8 h-2" />
                {error ? <Alert variant="destructive" className="mb-5"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}
                {question ? (
                    <Card className="rounded-lg">
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <Target className="h-5 w-5 text-primary" />
                                <span className="text-xs font-semibold uppercase text-muted-foreground">{question.difficulty}</span>
                            </div>
                            <CardTitle className="pt-4 text-xl leading-relaxed">{question.question}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3">
                            {question.options.map((option) => (
                                <Button
                                    key={option.id}
                                    type="button"
                                    variant={selected === option.id ? "default" : "outline"}
                                    className="h-auto min-h-12 justify-start whitespace-normal text-left"
                                    onClick={() => setSelected(option.id)}
                                >
                                    <span className="mr-3 font-bold">{option.id}</span>{option.text}
                                </Button>
                            ))}
                        </CardContent>
                        <CardFooter className="justify-end border-t pt-5">
                            <Button onClick={submit} disabled={!selected || submitting}>{submitting ? "..." : "Next question"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
                        </CardFooter>
                    </Card>
                ) : <Button onClick={() => user && start(user)}>Try again</Button>}
            </main>
        </div>
    );
}

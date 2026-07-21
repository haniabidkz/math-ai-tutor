"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { ArrowRight, CheckCircle2, Target, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SessionControls } from "@/components/session-controls";
import { auth, db } from "@/lib/firebase";
import type { ClientQuestion } from "@/lib/assessment-content";
import type { DiagnosticProfile } from "@/types/assessment";
import type { Locale } from "@/types/curriculum";

const copy = {
    english: { title: "Diagnostic", preparing: "Preparing your diagnostic...", next: "Next question", finish: "View learning plan", error: "The diagnostic could not continue. Please try again.", complete: "Your learning path is ready", score: "Accuracy", weak: "Focus areas" },
    "roman-urdu": { title: "Jaiza", preparing: "Aap ka jaiza tayar ho raha hai...", next: "Agla sawal", finish: "Learning plan dekhein", error: "Jaiza jari nahin reh saka. Dobara koshish karein.", complete: "Aap ka learning path tayar hai", score: "Durusti", weak: "Tawajjo ke hisay" },
};

export default function PlacementPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [locale, setLocale] = useState<Locale>("english");
    const [sessionId, setSessionId] = useState("");
    const [question, setQuestion] = useState<ClientQuestion | null>(null);
    const [questionNumber, setQuestionNumber] = useState(1);
    const [totalQuestions, setTotalQuestions] = useState(24);
    const [selected, setSelected] = useState("");
    const [profile, setProfile] = useState<DiagnosticProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const t = copy[locale];

    useEffect(() => {
        setLocale(localStorage.getItem("mathTutorLocale") === "roman-urdu" ? "roman-urdu" : "english");
        return onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) return router.replace("/login?role=student");
            if (!currentUser.emailVerified) {
                await signOut(auth);
                return router.replace("/login?role=student&verify=1");
            }
            setUser(currentUser);
            const profileSnapshot = await getDoc(doc(db, "students", currentUser.uid));
            const classLevel = profileSnapshot.data()?.class ?? 6;
            await start(currentUser, classLevel, localStorage.getItem("mathTutorLocale") === "roman-urdu" ? "roman-urdu" : "english");
        });
    }, [router]);

    async function start(currentUser: User, classLevel: number, selectedLocale: Locale) {
        setLoading(true);
        setError("");
        try {
            const response = await fetch("/api/placement", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
                body: JSON.stringify({ classLevel, locale: selectedLocale }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setSessionId(data.sessionId);
            setQuestion(data.question);
            setQuestionNumber(data.questionNumber);
            setTotalQuestions(data.totalQuestions);
        } catch {
            setError(copy[selectedLocale].error);
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
            setError(t.error);
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><p className="font-medium text-slate-600">{t.preparing}</p></div>;

    if (profile) return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
            <Card className="w-full max-w-lg rounded-lg border-t-4 border-t-emerald-500">
                <CardHeader><CheckCircle2 className="mb-3 h-12 w-12 text-emerald-600" /><CardTitle>{t.complete}</CardTitle></CardHeader>
                <CardContent className="space-y-5">
                    <div><span className="text-sm text-muted-foreground">{t.score}</span><p className="text-4xl font-bold">{profile.accuracyPercent}%</p></div>
                    <div><span className="text-sm text-muted-foreground">{t.weak}</span><p className="mt-1 text-sm">{profile.weakMicroTags.slice(0, 5).join(", ") || "None"}</p></div>
                </CardContent>
                <CardFooter><Button asChild className="w-full"><Link href="/dashboard">{t.finish}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></CardFooter>
            </Card>
        </main>
    );

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white"><div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4"><div><p className="font-semibold">{t.title}</p><p className="text-xs text-muted-foreground">{questionNumber} / {totalQuestions}</p></div><SessionControls locale={locale} onLocaleChange={setLocale} /></div></header>
            <main className="mx-auto max-w-3xl px-4 py-8">
                <Progress value={(questionNumber / totalQuestions) * 100} className="mb-8 h-2" />
                {error ? <Alert variant="destructive" className="mb-5"><XCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}
                {question ? <Card className="rounded-lg"><CardHeader><div className="flex items-center justify-between"><Target className="h-5 w-5 text-primary" /><span className="text-xs font-semibold uppercase text-muted-foreground">{question.difficulty}</span></div><CardTitle className="pt-4 text-xl leading-relaxed">{question.question}</CardTitle></CardHeader><CardContent className="grid gap-3">{question.options.map((option) => <Button key={option.id} type="button" variant={selected === option.id ? "default" : "outline"} className="h-auto min-h-12 justify-start whitespace-normal text-left" onClick={() => setSelected(option.id)}><span className="mr-3 font-bold">{option.id}</span>{option.text}</Button>)}</CardContent><CardFooter className="justify-end border-t pt-5"><Button onClick={submit} disabled={!selected || submitting}>{submitting ? "..." : t.next}<ArrowRight className="ml-2 h-4 w-4" /></Button></CardFooter></Card> : <Button onClick={() => user && start(user, 6, locale)}>Try again</Button>}
            </main>
        </div>
    );
}

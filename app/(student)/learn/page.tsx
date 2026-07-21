"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { ConceptGraphic } from "@/components/concept-graphic";
import { SessionControls } from "@/components/session-controls";
import { TextToSpeech } from "@/components/tts-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/firebase";
import type { Difficulty, Locale } from "@/types/curriculum";

interface LessonConcept {
    microTag: string;
    title: string;
    concept: string;
    topicTitle: string;
    visualKind: string;
    imageUrl?: string;
}

const copy = {
    english: { back: "Dashboard", lesson: "Concept lesson", another: "Explain another way", ready: "I understand, start quiz", error: "The lesson could not be loaded.", retry: "Try again" },
    "roman-urdu": { back: "Dashboard", lesson: "Concept ka sabaq", another: "Doosray tareeqay se samjhayein", ready: "Samajh aa gaya, quiz shuru karein", error: "Sabaq load nahin ho saka.", retry: "Dobara koshish" },
};

function LearnContent() {
    const router = useRouter();
    const params = useSearchParams();
    const microTag = params.get("microTag") ?? params.get("topicId") ?? "";
    const classLevel = Number(params.get("class") ?? 6);
    const [user, setUser] = useState<User | null>(null);
    const [locale, setLocale] = useState<Locale>("english");
    const [difficulty, setDifficulty] = useState<Difficulty>("medium");
    const [content, setContent] = useState("");
    const [concept, setConcept] = useState<LessonConcept | null>(null);
    const [teachingLevel, setTeachingLevel] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const t = copy[locale];

    useEffect(() => {
        const storedLocale: Locale = localStorage.getItem("mathTutorLocale") === "roman-urdu" ? "roman-urdu" : "english";
        const storedDifficulty = localStorage.getItem("mathTutorDifficulty");
        const selectedDifficulty: Difficulty = storedDifficulty === "easy" || storedDifficulty === "hard" ? storedDifficulty : "medium";
        setLocale(storedLocale); setDifficulty(selectedDifficulty);
        return onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) return router.replace("/login?role=student");
            if (!currentUser.emailVerified) { await signOut(auth); return router.replace("/login?role=student&verify=1"); }
            setUser(currentUser); await loadLesson(currentUser, storedLocale, 1);
        });
    }, [router]);

    async function loadLesson(currentUser: User, selectedLocale: Locale, level: number) {
        setLoading(true); setError("");
        try {
            const response = await fetch("/api/teach", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` }, body: JSON.stringify({ microTag, classLevel, locale: selectedLocale, teachingLevel: level }) });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setContent(data.content); setConcept(data.concept); setTeachingLevel(level);
        } catch { setError(copy[selectedLocale].error); }
        finally { setLoading(false); }
    }

    async function startQuiz() {
        if (!user || !concept) return;
        await fetch("/api/teach", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` }, body: JSON.stringify({ microTag: concept.microTag, understood: true, teachingLevel }) });
        router.push(`/quiz?microTag=${encodeURIComponent(concept.microTag)}&class=${classLevel}&difficulty=${difficulty}`);
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white"><div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-4"><Button variant="ghost" asChild><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />{t.back}</Link></Button><SessionControls locale={locale} onLocaleChange={(next) => { setLocale(next); if (user) void loadLesson(user, next, teachingLevel); }} difficulty={difficulty} onDifficultyChange={setDifficulty} /></div></header>
            <main className="mx-auto max-w-4xl p-4 py-8">
                {error ? <Alert variant="destructive" className="mb-5"><XCircle className="h-4 w-4" /><AlertDescription className="flex items-center justify-between gap-3">{error}<Button size="sm" variant="outline" onClick={() => user && loadLesson(user, locale, teachingLevel)}>{t.retry}</Button></AlertDescription></Alert> : null}
                {loading && !concept ? <p className="py-20 text-center text-muted-foreground">Loading lesson...</p> : concept ? <Card className="overflow-hidden rounded-lg"><ConceptGraphic kind={concept.visualKind} /><CardHeader className="border-b"><div className="flex items-center justify-between"><Badge variant="outline"><BookOpen className="mr-1 h-3 w-3" />{t.lesson}</Badge><TextToSpeech text={content} /></div><CardTitle className="pt-3 text-2xl">{concept.title}</CardTitle><p className="text-sm text-muted-foreground">{concept.topicTitle}</p></CardHeader><CardContent className="min-h-56 py-6"><div className="prose max-w-none leading-7"><ReactMarkdown>{content}</ReactMarkdown></div></CardContent><CardFooter className="flex flex-wrap justify-between gap-3 border-t bg-slate-50 py-5"><Button variant="outline" onClick={() => user && loadLesson(user, locale, Math.min(3, teachingLevel + 1))} disabled={loading}><RotateCcw className="mr-2 h-4 w-4" />{t.another}</Button><Button onClick={startQuiz}><CheckCircle2 className="mr-2 h-4 w-4" />{t.ready}<ArrowRight className="ml-2 h-4 w-4" /></Button></CardFooter></Card> : null}
            </main>
        </div>
    );
}

export default function LearnPage() {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}><LearnContent /></Suspense>;
}

"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import { BilingualText } from "@/components/bilingual-text";
import { ConceptBrowser, type BrowsableTopic } from "@/components/concept-browser";
import { ConceptGraphic } from "@/components/concept-graphic";
import { TextToSpeech } from "@/components/tts-button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/firebase";
import type { LocalizedText } from "@/types/curriculum";

interface LessonConcept {
    microTag: string;
    title: string;
    topicTitle: string;
    visualKind: string;
    imageUrl?: string;
}

function LearnContent() {
    const router = useRouter();
    const params = useSearchParams();
    const microTag = params.get("microTag") ?? params.get("topicId") ?? "";
    const classLevel = Number(params.get("class") ?? 6);
    const [user, setUser] = useState<User | null>(null);
    const [content, setContent] = useState<LocalizedText | null>(null);
    const [concept, setConcept] = useState<LessonConcept | null>(null);
    const [teachingLevel, setTeachingLevel] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [browseTopics, setBrowseTopics] = useState<BrowsableTopic[] | null>(null);
    const [browseClass, setBrowseClass] = useState(classLevel);

    useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
        if (!currentUser) return router.replace("/login?role=student");
        setUser(currentUser);
        // Reached from the "Learn Topics" nav with no concept chosen: show a picker.
        if (!microTag) return loadTopics(currentUser);
        await loadLesson(currentUser, 1);
    }), [router]);

    async function loadTopics(currentUser: User) {
        setLoading(true); setError("");
        try {
            const response = await fetch("/api/progress", { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setBrowseTopics(data.topics);
            setBrowseClass(data.profile.classLevel);
        } catch { setError("Your topics could not be loaded."); }
        finally { setLoading(false); }
    }

    async function loadLesson(currentUser: User, level: number) {
        setLoading(true); setError("");
        try {
            const response = await fetch("/api/teach", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await currentUser.getIdToken()}` },
                body: JSON.stringify({ microTag, classLevel, teachingLevel: level }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setContent(data.content);
            setConcept(data.concept);
            setTeachingLevel(level);
        } catch { setError("The lesson could not be loaded."); }
        finally { setLoading(false); }
    }

    async function startQuiz() {
        if (!user || !concept) return;
        await fetch("/api/teach", {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
            body: JSON.stringify({ microTag: concept.microTag, understood: true, teachingLevel }),
        });
        // The quiz level is chosen automatically; students go straight in.
        router.push(`/quiz?microTag=${encodeURIComponent(concept.microTag)}&class=${classLevel}`);
    }

    const retry = () => user && (microTag ? loadLesson(user, teachingLevel) : loadTopics(user));

    return (
        <div className="min-h-screen bg-slate-50">
            <header className="border-b bg-white">
                <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-4">
                    <Button variant="ghost" asChild><Link href="/dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Dashboard</Link></Button>
                </div>
            </header>
            <main className="mx-auto max-w-4xl p-4 py-8">
                {error ? (
                    <Alert variant="destructive" className="mb-5">
                        <XCircle className="h-4 w-4" />
                        <AlertDescription className="flex items-center justify-between gap-3">
                            {error}<Button size="sm" variant="outline" onClick={retry}>Try again</Button>
                        </AlertDescription>
                    </Alert>
                ) : null}

                {!microTag ? (
                    loading ? <p className="py-20 text-center text-muted-foreground">Loading topics...</p> : (
                        <>
                            <div className="mb-6">
                                <h1 className="text-2xl font-bold tracking-tight">Learn Topics</h1>
                                <p className="text-sm text-muted-foreground">Pick a concept to start a lesson.</p>
                            </div>
                            {browseTopics ? <ConceptBrowser topics={browseTopics} classLevel={browseClass} locale="english" /> : null}
                        </>
                    )
                ) : loading && !concept ? (
                    <p className="py-20 text-center text-muted-foreground">Loading lesson...</p>
                ) : concept && content ? (
                    <Card className="overflow-hidden rounded-lg">
                        <ConceptGraphic kind={concept.visualKind} />
                        <CardHeader className="border-b">
                            <div className="flex items-center justify-between">
                                <Badge variant="outline"><BookOpen className="mr-1 h-3 w-3" />Concept lesson</Badge>
                                <TextToSpeech text={content.english} />
                            </div>
                            <CardTitle className="pt-3 text-2xl">{concept.title}</CardTitle>
                            <p className="text-sm text-muted-foreground">{concept.topicTitle}</p>
                        </CardHeader>
                        <CardContent className="min-h-56 py-6">
                            <BilingualText text={content} markdown />
                        </CardContent>
                        <CardFooter className="flex flex-wrap justify-between gap-3 border-t bg-slate-50 py-5">
                            <Button variant="outline" onClick={() => user && loadLesson(user, Math.min(3, teachingLevel + 1))} disabled={loading}>
                                <RotateCcw className="mr-2 h-4 w-4" />Explain another way
                            </Button>
                            <Button onClick={startQuiz}>
                                <CheckCircle2 className="mr-2 h-4 w-4" />I understand, start quiz<ArrowRight className="ml-2 h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                ) : null}
            </main>
        </div>
    );
}

export default function LearnPage() {
    return <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}><LearnContent /></Suspense>;
}

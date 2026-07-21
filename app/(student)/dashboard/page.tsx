"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { BookOpen, CheckCircle2, ChevronRight, Clock, LayoutDashboard, LockKeyhole, Trophy } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { SessionControls } from "@/components/session-controls";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/firebase";
import type { Locale, MicroConcept } from "@/types/curriculum";

interface DashboardConcept extends MicroConcept { mastered: boolean; percentage: number; locked: boolean }
interface DashboardData {
    profile: { name: string; email: string; classLevel: 6 | 7 | 8; diagnosticCompleted: boolean };
    topics: Array<{ topicId: string; title: MicroConcept["topicTitle"]; concepts: DashboardConcept[] }>;
    metrics: { mastered: number; inProgress: number; available: number; total: number };
    weeklyDue: boolean;
    nextWeeklyAssessmentAt: string | null;
}

export default function StudentDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [data, setData] = useState<DashboardData | null>(null);
    const [locale, setLocale] = useState<Locale>("english");
    const [error, setError] = useState("");

    useEffect(() => {
        setLocale(localStorage.getItem("mathTutorLocale") === "roman-urdu" ? "roman-urdu" : "english");
        return onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) return router.replace("/login?role=student");
            if (!currentUser.emailVerified) { await signOut(auth); return router.replace("/login?role=student&verify=1"); }
            setUser(currentUser);
            try {
                const response = await fetch("/api/progress", { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error);
                if (!payload.profile.diagnosticCompleted) return router.replace("/placement");
                setData(payload);
            } catch (caught) { setError(caught instanceof Error ? caught.message : "Progress could not be loaded"); }
        });
    }, [router]);

    if (!data || !user) return <div className="mx-auto min-h-screen max-w-6xl space-y-5 bg-slate-50 p-8">{error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : <><Skeleton className="h-16 w-full" /><div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-96" /></>}</div>;

    const localize = (value: { english: string; romanUrdu: string }) => locale === "roman-urdu" ? value.romanUrdu : value.english;
    return (
        <DashboardLayout user={{ name: data.profile.name, email: data.profile.email, role: "student", classLevel: data.profile.classLevel }} onSignOut={() => signOut(auth).then(() => router.push("/"))}>
            <PageHeader title={locale === "roman-urdu" ? `Khush amdeed, ${data.profile.name.split(" ")[0]}` : `Welcome, ${data.profile.name.split(" ")[0]}`} description={locale === "roman-urdu" ? "Apna agla math concept chunein." : "Choose the next math concept in your learning path."} icon={<LayoutDashboard className="h-6 w-6" />} action={<SessionControls locale={locale} onLocaleChange={setLocale} />} />
            {data.weeklyDue ? <Alert className="border-amber-300 bg-amber-50"><Clock className="h-4 w-4 text-amber-700" /><AlertTitle>{locale === "roman-urdu" ? "Haftawar jaiza tayar hai" : "Weekly review is ready"}</AlertTitle><AlertDescription className="mt-2 flex flex-wrap items-center justify-between gap-3"><span>{locale === "roman-urdu" ? "8 sawalon se apni taraqqi check karein." : "Check retention with an 8-question review."}</span><Button size="sm" asChild><Link href={`/quiz?kind=weekly&class=${data.profile.classLevel}`}>{locale === "roman-urdu" ? "Shuru karein" : "Start review"}<ChevronRight className="ml-1 h-4 w-4" /></Link></Button></AlertDescription></Alert> : null}
            <div className="grid gap-4 md:grid-cols-3"><StatCard title={locale === "roman-urdu" ? "Mukammal concepts" : "Mastered concepts"} value={data.metrics.mastered} icon={Trophy} color="success" description={`${data.metrics.mastered}/${data.metrics.total}`} /><StatCard title={locale === "roman-urdu" ? "Jari" : "In progress"} value={data.metrics.inProgress} icon={BookOpen} color="primary" description={locale === "roman-urdu" ? "Mashq jari rakhein" : "Keep practicing"} /><StatCard title={locale === "roman-urdu" ? "Dastiyab" : "Available now"} value={data.metrics.available} icon={CheckCircle2} color="warning" description={locale === "roman-urdu" ? "Agla qadam chunein" : "Choose your next step"} /></div>
            <section className="space-y-6">{data.topics.map((topic) => <div key={topic.topicId}><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-semibold">{localize(topic.title)}</h2><Badge variant="outline">Class {data.profile.classLevel}</Badge></div><div className="grid gap-3 md:grid-cols-2">{topic.concepts.map((concept) => {
                const content = <Card className={`rounded-md border-l-4 ${concept.mastered ? "border-l-emerald-500" : concept.locked ? "border-l-slate-300 opacity-65" : "border-l-indigo-500"}`}><CardContent className="flex min-h-24 items-center gap-4 p-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100">{concept.mastered ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : concept.locked ? <LockKeyhole className="h-5 w-5 text-slate-500" /> : <BookOpen className="h-5 w-5 text-indigo-600" />}</div><div className="min-w-0 flex-1"><h3 className="font-semibold">{localize(concept.title)}</h3><p className="mt-1 text-xs text-muted-foreground">{concept.mastered ? `${concept.percentage}% mastered` : concept.locked ? (locale === "roman-urdu" ? "Pehle pichla concept mukammal karein" : "Complete the prerequisite first") : (locale === "roman-urdu" ? "Seekhna shuru karein" : "Ready to learn")}</p></div>{!concept.locked ? <ChevronRight className="h-5 w-5 text-muted-foreground" /> : null}</CardContent></Card>;
                return concept.locked ? <div key={concept.microTag}>{content}</div> : <Link key={concept.microTag} href={`/learn?microTag=${concept.microTag}&class=${data.profile.classLevel}`}>{content}</Link>;
            })}</div></div>)}</section>
        </DashboardLayout>
    );
}

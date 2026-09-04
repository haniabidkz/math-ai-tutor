"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
    Award, BookOpen, CheckCircle2, ChevronRight, ClipboardCheck, Clock, Flame,
    LayoutDashboard, LockKeyhole, Sparkles, Target, Trophy, type LucideIcon,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { SessionControls } from "@/components/session-controls";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/firebase";
import type { Locale, LocalizedText, MicroConcept } from "@/types/curriculum";

interface DashboardConcept extends MicroConcept { mastered: boolean; percentage: number; locked: boolean }

interface DashboardBadge {
    id: string;
    title: LocalizedText;
    description: LocalizedText;
    icon: string;
    earned: boolean;
}

interface DashboardData {
    profile: { name: string; email: string; classLevel: 6 | 7 | 8; diagnosticCompleted: boolean };
    gamification: {
        xp: number;
        streak: { current: number; longest: number; lastActivityDate: string | null };
        quizzesCompleted: number;
        lessonsCompleted: number;
        questionsAnswered: number;
        badges: DashboardBadge[];
    };
    nextLesson: { microTag: string; title: LocalizedText; topicTitle: LocalizedText; percentage: number } | null;
    topics: Array<{ topicId: string; title: MicroConcept["topicTitle"]; concepts: DashboardConcept[] }>;
    metrics: { mastered: number; inProgress: number; available: number; total: number };
    weeklyDue: boolean;
    nextWeeklyAssessmentAt: string | null;
}

const BADGE_ICONS: Record<string, LucideIcon> = { BookOpen, ClipboardCheck, Flame, Target, Trophy };

const copy = {
    english: {
        welcome: (name: string) => `Welcome, ${name}`,
        subtitle: "Choose the next math concept in your learning path.",
        weeklyTitle: "Weekly review is ready", weeklyBody: "Check retention with an 8-question review.", weeklyCta: "Start review",
        xp: "Total XP", streak: "Day streak", mastered: "Mastered concepts", available: "Available now",
        overall: "Overall progress", nextLesson: "Next recommended lesson", startLesson: "Start lesson",
        badges: "Badges", earned: "earned", locked: "Locked", allDone: "Every concept in your class is mastered.",
        readyToLearn: "Ready to learn", completePrerequisite: "Complete the prerequisite first", masteredLabel: "mastered",
        longest: "Longest",
    },
    "roman-urdu": {
        welcome: (name: string) => `Khush amdeed, ${name}`,
        subtitle: "Apna agla math concept chunein.",
        weeklyTitle: "Haftawar jaiza tayar hai", weeklyBody: "8 sawalon se apni taraqqi check karein.", weeklyCta: "Shuru karein",
        xp: "Kul XP", streak: "Din ka streak", mastered: "Mukammal concepts", available: "Dastiyab",
        overall: "Majmui taraqqi", nextLesson: "Agla tajweez karda sabaq", startLesson: "Sabaq shuru karein",
        badges: "Badges", earned: "hasil", locked: "Band", allDone: "Aap ki class ke tamam concepts mukammal ho gaye.",
        readyToLearn: "Seekhna shuru karein", completePrerequisite: "Pehle pichla concept mukammal karein", masteredLabel: "mukammal",
        longest: "Sab se lamba",
    },
};

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
            setUser(currentUser);
            try {
                const response = await fetch("/api/progress", { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } });
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error);
                if (!payload.profile.diagnosticCompleted) return router.replace("/placement");
                setData(payload);
            } catch (caught) {
                setError(caught instanceof Error ? caught.message : "Progress could not be loaded");
            }
        });
    }, [router]);

    if (!data || !user) return (
        <div className="mx-auto min-h-screen max-w-6xl space-y-5 bg-slate-50 p-8">
            {error
                ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                : <><Skeleton className="h-16 w-full" /><div className="grid gap-4 md:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-96" /></>}
        </div>
    );

    const t = copy[locale];
    const localize = (value: LocalizedText) => locale === "roman-urdu" ? value.romanUrdu : value.english;
    const overallPercent = data.metrics.total ? Math.round((data.metrics.mastered / data.metrics.total) * 100) : 0;
    const earnedBadges = data.gamification.badges.filter((badge) => badge.earned);

    return (
        <DashboardLayout
            user={{ name: data.profile.name, email: data.profile.email, role: "student", classLevel: data.profile.classLevel }}
            onSignOut={() => signOut(auth).then(() => router.push("/"))}
        >
            <PageHeader
                title={t.welcome(data.profile.name.split(" ")[0])}
                description={t.subtitle}
                icon={<LayoutDashboard className="h-6 w-6" />}
                action={<SessionControls locale={locale} onLocaleChange={setLocale} />}
            />

            {data.weeklyDue ? (
                <Alert className="border-amber-300 bg-amber-50">
                    <Clock className="h-4 w-4 text-amber-700" />
                    <AlertTitle>{t.weeklyTitle}</AlertTitle>
                    <AlertDescription className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <span>{t.weeklyBody}</span>
                        <Button size="sm" asChild>
                            <Link href={`/quiz?kind=weekly&class=${data.profile.classLevel}`}>{t.weeklyCta}<ChevronRight className="ml-1 h-4 w-4" /></Link>
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title={t.xp} value={data.gamification.xp} icon={Sparkles} color="primary" description={`${data.gamification.quizzesCompleted} quizzes`} />
                <StatCard
                    title={t.streak}
                    value={data.gamification.streak.current}
                    icon={Flame}
                    color="warning"
                    description={`${t.longest}: ${data.gamification.streak.longest}`}
                />
                <StatCard title={t.mastered} value={data.metrics.mastered} icon={Trophy} color="success" description={`${data.metrics.mastered}/${data.metrics.total}`} />
                <StatCard title={t.available} value={data.metrics.available} icon={CheckCircle2} color="default" description={t.readyToLearn} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-3"><CardTitle className="text-base">{t.overall}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-end justify-between">
                            <span className="text-3xl font-bold">{overallPercent}%</span>
                            <span className="text-sm text-muted-foreground">{data.metrics.mastered} / {data.metrics.total}</span>
                        </div>
                        <Progress value={overallPercent} className="h-2" aria-label={t.overall} />
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-3"><CardTitle className="text-base">{t.nextLesson}</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {data.nextLesson ? (
                            <>
                                <div>
                                    <p className="font-semibold">{localize(data.nextLesson.title)}</p>
                                    <p className="text-xs text-muted-foreground">{localize(data.nextLesson.topicTitle)}</p>
                                </div>
                                <Button size="sm" className="w-full" asChild>
                                    <Link href={`/learn?microTag=${data.nextLesson.microTag}&class=${data.profile.classLevel}`}>
                                        {t.startLesson}<ChevronRight className="ml-1 h-4 w-4" />
                                    </Link>
                                </Button>
                            </>
                        ) : <p className="text-sm text-muted-foreground">{t.allDone}</p>}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-base">
                        <span>{t.badges}</span>
                        <Badge variant="secondary">{earnedBadges.length} / {data.gamification.badges.length} {t.earned}</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {data.gamification.badges.map((badge) => {
                            const Icon = BADGE_ICONS[badge.icon] ?? Award;
                            return (
                                <div
                                    key={badge.id}
                                    title={badge.earned ? localize(badge.description) : t.locked}
                                    className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center ${badge.earned ? "border-emerald-200 bg-emerald-50" : "border-dashed bg-slate-50 opacity-60"}`}
                                >
                                    <Icon className={`h-6 w-6 ${badge.earned ? "text-emerald-600" : "text-slate-400"}`} />
                                    <span className={`text-xs font-semibold ${badge.earned ? "text-emerald-900" : "text-slate-500"}`}>{localize(badge.title)}</span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <section className="space-y-6">
                {data.topics.map((topic) => {
                    const masteredInTopic = topic.concepts.filter((concept) => concept.mastered).length;
                    const topicPercent = topic.concepts.length ? Math.round((masteredInTopic / topic.concepts.length) * 100) : 0;
                    return (
                        <div key={topic.topicId}>
                            <div className="mb-2 flex items-center justify-between">
                                <h2 className="text-lg font-semibold">{localize(topic.title)}</h2>
                                <Badge variant="outline">{masteredInTopic}/{topic.concepts.length} {t.masteredLabel}</Badge>
                            </div>
                            <Progress value={topicPercent} className="mb-3 h-1.5" aria-label={`${localize(topic.title)} ${topicPercent}%`} />
                            <div className="grid gap-3 md:grid-cols-2">
                                {topic.concepts.map((concept) => {
                                    const content = (
                                        <Card className={`rounded-md border-l-4 ${concept.mastered ? "border-l-emerald-500" : concept.locked ? "border-l-slate-300 opacity-65" : "border-l-indigo-500"}`}>
                                            <CardContent className="flex min-h-24 items-center gap-4 p-4">
                                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100">
                                                    {concept.mastered ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                                        : concept.locked ? <LockKeyhole className="h-5 w-5 text-slate-500" />
                                                            : <BookOpen className="h-5 w-5 text-indigo-600" />}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="font-semibold">{localize(concept.title)}</h3>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {concept.mastered ? `${concept.percentage}% ${t.masteredLabel}` : concept.locked ? t.completePrerequisite : t.readyToLearn}
                                                    </p>
                                                </div>
                                                {!concept.locked ? <ChevronRight className="h-5 w-5 text-muted-foreground" /> : null}
                                            </CardContent>
                                        </Card>
                                    );
                                    return concept.locked
                                        ? <div key={concept.microTag}>{content}</div>
                                        : <Link key={concept.microTag} href={`/learn?microTag=${concept.microTag}&class=${data.profile.classLevel}`}>{content}</Link>;
                                })}
                            </div>
                        </div>
                    );
                })}
            </section>
        </DashboardLayout>
    );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
    Award, BookOpen, CheckCircle2, ChevronRight, ClipboardCheck, Clock, Flame,
    LayoutDashboard, NotebookPen, Sparkles, Target, Trophy, type LucideIcon,
} from "lucide-react";
import { ActiveTopicList, type ActiveTopic } from "@/components/active-topics";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/firebase";
import type { LocalizedText } from "@/types/curriculum";
import type { StudentHomework } from "@/types/homework";

interface DashboardBadge {
    id: string;
    title: LocalizedText;
    description: LocalizedText;
    icon: string;
    earned: boolean;
}

interface DiagnosticTopicSummary {
    topicKey: string;
    title: LocalizedText;
    correct: number;
    total: number;
    band: "strong" | "needs-practice" | "weak" | "very-weak";
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
    learningStatus: { key: string; label: LocalizedText; openMisconceptions: number };
    diagnostic: { topicResults: DiagnosticTopicSummary[]; overallBand: string | null; overallCorrect: number | null; overallTotal: number | null } | null;
    homework: StudentHomework[];
    nextLesson: { microTag: string; title: LocalizedText; topicTitle: LocalizedText; percentage: number; reason: string } | null;
    activeTopics: ActiveTopic[];
    metrics: { mastered: number; inProgress: number; available: number; total: number };
    weeklyDue: boolean;
    nextWeeklyAssessmentAt: string | null;
}

const BADGE_ICONS: Record<string, LucideIcon> = { BookOpen, ClipboardCheck, Flame, Target, Trophy };

const BAND_STYLES: Record<string, string> = {
    strong: "bg-emerald-100 text-emerald-800",
    "needs-practice": "bg-amber-100 text-amber-800",
    weak: "bg-orange-100 text-orange-800",
    "very-weak": "bg-red-100 text-red-800",
};

const STATUS_STYLES: Record<string, string> = {
    "on-track": "border-l-emerald-500",
    "needs-practice": "border-l-amber-500",
    "needs-support": "border-l-red-500",
    "getting-started": "border-l-slate-400",
};

const RECOMMENDATION_REASONS: Record<string, string> = {
    misconception: "Chosen because a mistake keeps repeating here.",
    "diagnostic-weak-topic": "Chosen from your weakest diagnostic topic.",
    "diagnostic-recommendation": "Recommended by your diagnostic.",
    "next-in-path": "The next step in your learning path.",
};

const HOMEWORK_STATUS: Record<string, string> = {
    not_started: "Not started",
    in_progress: "In progress",
    completed: "Completed",
};

export default function StudentDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [data, setData] = useState<DashboardData | null>(null);
    const [error, setError] = useState("");

    useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
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
    }), [router]);

    if (!data || !user) return (
        <div className="mx-auto min-h-screen max-w-6xl space-y-5 bg-slate-50 p-8">
            {error
                ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
                : <><Skeleton className="h-16 w-full" /><div className="grid gap-4 md:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><Skeleton className="h-96" /></>}
        </div>
    );

    const overallPercent = data.metrics.total ? Math.round((data.metrics.mastered / data.metrics.total) * 100) : 0;
    const earnedBadges = data.gamification.badges.filter((badge) => badge.earned);

    return (
        <DashboardLayout
            user={{ name: data.profile.name, email: data.profile.email, role: "student", classLevel: data.profile.classLevel }}
            onSignOut={() => signOut(auth).then(() => router.push("/"))}
        >
            <PageHeader
                title={`Welcome, ${data.profile.name.split(" ")[0]}`}
                description="Here is what to work on next."
                icon={<LayoutDashboard className="h-6 w-6" />}
            />

            {data.weeklyDue ? (
                <Alert className="border-amber-300 bg-amber-50">
                    <Clock className="h-4 w-4 text-amber-700" />
                    <AlertTitle>Weekly review is ready</AlertTitle>
                    <AlertDescription className="mt-2 flex flex-wrap items-center justify-between gap-3">
                        <span>Check what you remember with a short review.</span>
                        <Button size="sm" asChild>
                            <Link href={`/quiz?kind=weekly&class=${data.profile.classLevel}`}>Start review<ChevronRight className="ml-1 h-4 w-4" /></Link>
                        </Button>
                    </AlertDescription>
                </Alert>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Total XP" value={data.gamification.xp} icon={Sparkles} color="primary" description={`${data.gamification.quizzesCompleted} quizzes`} />
                <StatCard title="Day streak" value={data.gamification.streak.current} icon={Flame} color="warning" description={`Longest: ${data.gamification.streak.longest}`} />
                <StatCard title="Mastered" value={data.metrics.mastered} icon={Trophy} color="success" description={`${data.metrics.mastered} of ${data.metrics.total} topics`} />
                <StatCard title="Available now" value={data.metrics.available} icon={CheckCircle2} color="default" description="Ready to learn" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className={`border-l-4 ${STATUS_STYLES[data.learningStatus.key] ?? "border-l-slate-400"}`}>
                    <CardHeader className="pb-3"><CardTitle className="text-base">Learning status</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-2xl font-bold">{data.learningStatus.label.english}</p>
                        {data.learningStatus.openMisconceptions > 0 ? (
                            <p className="text-xs text-muted-foreground">{data.learningStatus.openMisconceptions} repeated {data.learningStatus.openMisconceptions === 1 ? "mistake" : "mistakes"} to work on</p>
                        ) : null}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">Overall progress</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-end justify-between">
                            <span className="text-3xl font-bold">{overallPercent}%</span>
                            <span className="text-sm text-muted-foreground">{data.metrics.mastered} / {data.metrics.total}</span>
                        </div>
                        <Progress value={overallPercent} className="h-2" aria-label="Overall progress" />
                    </CardContent>
                </Card>

                <Card className="border-l-4 border-l-indigo-500">
                    <CardHeader className="pb-3"><CardTitle className="text-base">Next recommended lesson</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        {data.nextLesson ? (
                            <>
                                <div>
                                    <p className="font-semibold">{data.nextLesson.title.english}</p>
                                    <p className="text-xs text-muted-foreground">{data.nextLesson.topicTitle.english}</p>
                                    <p className="mt-1 text-xs text-indigo-700">{RECOMMENDATION_REASONS[data.nextLesson.reason] ?? ""}</p>
                                </div>
                                <Button size="sm" className="w-full" asChild>
                                    <Link href={`/learn?microTag=${data.nextLesson.microTag}&class=${data.profile.classLevel}`}>
                                        Start lesson<ChevronRight className="ml-1 h-4 w-4" />
                                    </Link>
                                </Button>
                            </>
                        ) : <p className="text-sm text-muted-foreground">Every topic in your class is mastered.</p>}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                        <span>Your 5 active topics</span>
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/learn">View all topics<ChevronRight className="ml-1 h-4 w-4" /></Link>
                        </Button>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ActiveTopicList topics={data.activeTopics} classLevel={data.profile.classLevel} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <NotebookPen className="h-4 w-4" />Homework
                        {data.homework.length ? <Badge variant="secondary">{data.homework.filter((item) => item.status !== "completed").length} to do</Badge> : null}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.homework.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No homework assigned right now.</p>
                    ) : (
                        <ul className="grid gap-3">
                            {data.homework.map((item) => (
                                <li key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${item.overdue ? "border-red-200 bg-red-50" : "bg-slate-50"}`}>
                                    <div className="min-w-0">
                                        {item.packetTitle ? <p className="text-[11px] font-semibold uppercase text-indigo-700">{item.packetTitle}</p> : null}
                                        <p className="font-semibold">{item.title.english}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.topicTitle.english} · {item.questionCount} questions · Due {item.dueDate}
                                            {item.overdue ? " · Overdue" : ""}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={item.status === "completed" ? "secondary" : item.overdue ? "destructive" : "outline"}>
                                            {HOMEWORK_STATUS[item.status]}{item.percentage !== null ? ` · ${item.percentage}%` : ""}
                                        </Badge>
                                        {item.status !== "completed" ? (
                                            <Button size="sm" asChild>
                                                <Link href={`/quiz?homeworkId=${item.id}&class=${data.profile.classLevel}`}>
                                                    {item.status === "in_progress" ? "Resume" : "Start"}
                                                </Link>
                                            </Button>
                                        ) : null}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {data.diagnostic?.topicResults?.length ? (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="flex items-center justify-between text-base">
                            <span>Diagnostic results</span>
                            {data.diagnostic.overallCorrect !== null ? (
                                <Badge variant="outline">{data.diagnostic.overallCorrect} / {data.diagnostic.overallTotal}</Badge>
                            ) : null}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            {data.diagnostic.topicResults.map((topic) => (
                                <div key={topic.topicKey} className="rounded-lg border p-3">
                                    <p className="text-sm font-semibold">{topic.title.english}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{topic.correct} / {topic.total}</p>
                                    <span className={`mt-2 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${BAND_STYLES[topic.band] ?? ""}`}>
                                        {topic.band.replace("-", " ")}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between text-base">
                        <span>Badges</span>
                        <Badge variant="secondary">{earnedBadges.length} / {data.gamification.badges.length} earned</Badge>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {data.gamification.badges.map((badge) => {
                            const Icon = BADGE_ICONS[badge.icon] ?? Award;
                            return (
                                <div
                                    key={badge.id}
                                    title={badge.earned ? badge.description.english : "Locked"}
                                    className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center ${badge.earned ? "border-emerald-200 bg-emerald-50" : "border-dashed bg-slate-50 opacity-60"}`}
                                >
                                    <Icon className={`h-6 w-6 ${badge.earned ? "text-emerald-600" : "text-slate-400"}`} />
                                    <span className={`text-xs font-semibold ${badge.earned ? "text-emerald-900" : "text-slate-500"}`}>{badge.title.english}</span>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>
        </DashboardLayout>
    );
}

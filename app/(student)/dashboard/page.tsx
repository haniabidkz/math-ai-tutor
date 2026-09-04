"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import {
    Award, BookOpen, CheckCircle2, ChevronRight, ClipboardCheck, Clock, Flame,
    LayoutDashboard, NotebookPen, Sparkles, Target, Trophy, type LucideIcon,
} from "lucide-react";
import { ConceptBrowser, type BrowsableTopic } from "@/components/concept-browser";
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
import type { Locale, LocalizedText } from "@/types/curriculum";
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
    topics: BrowsableTopic[];
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

const copy = {
    english: {
        welcome: (name: string) => `Welcome, ${name}`,
        subtitle: "Choose the next math concept in your learning path.",
        weeklyTitle: "Weekly review is ready", weeklyBody: "Check retention with a short review.", weeklyCta: "Start review",
        xp: "Total XP", streak: "Day streak", mastered: "Mastered concepts", available: "Available now",
        overall: "Overall progress", nextLesson: "Next recommended lesson", startLesson: "Start lesson",
        badges: "Badges", earned: "earned", locked: "Locked", allDone: "Every concept in your class is mastered.",
        readyToLearn: "Ready to learn", masteredLabel: "mastered", longest: "Longest",
        status: "Learning status", misconceptions: "open misconceptions",
        homework: "Homework", noHomework: "No homework assigned right now.",
        due: "Due", overdue: "Overdue", start: "Start", resume: "Resume", done: "Completed",
        notStarted: "Not started", inProgress: "In progress",
        diagnostic: "Diagnostic results", questions: "questions",
        reasons: {
            misconception: "Chosen because a mistake keeps repeating here.",
            "diagnostic-weak-topic": "Chosen from your weakest diagnostic topic.",
            "diagnostic-recommendation": "Recommended by your diagnostic.",
            "next-in-path": "The next step in your learning path.",
            "all-mastered": "",
        } as Record<string, string>,
    },
    "roman-urdu": {
        welcome: (name: string) => `Khush amdeed, ${name}`,
        subtitle: "Apna agla math concept chunein.",
        weeklyTitle: "Haftawar jaiza tayar hai", weeklyBody: "Chhote jaizay se apni taraqqi check karein.", weeklyCta: "Shuru karein",
        xp: "Kul XP", streak: "Din ka streak", mastered: "Mukammal concepts", available: "Dastiyab",
        overall: "Majmui taraqqi", nextLesson: "Agla tajweez karda sabaq", startLesson: "Sabaq shuru karein",
        badges: "Badges", earned: "hasil", locked: "Band", allDone: "Aap ki class ke tamam concepts mukammal ho gaye.",
        readyToLearn: "Seekhna shuru karein", masteredLabel: "mukammal", longest: "Sab se lamba",
        status: "Seekhne ki soorat-e-haal", misconceptions: "khuli ghalat-fehmiyan",
        homework: "Homework", noHomework: "Abhi koi homework nahin mila.",
        due: "Aakhri tareekh", overdue: "Waqt guzar gaya", start: "Shuru karein", resume: "Jari rakhein", done: "Mukammal",
        notStarted: "Shuru nahin hua", inProgress: "Jari hai",
        diagnostic: "Tashkhees ke nataij", questions: "sawal",
        reasons: {
            misconception: "Yahan ghalti baar baar ho rahi hai, is liye yeh chuna gaya.",
            "diagnostic-weak-topic": "Aap ke sab se kamzor topic se chuna gaya.",
            "diagnostic-recommendation": "Aap ki tashkhees ne yeh tajweez kiya.",
            "next-in-path": "Aap ke learning path ka agla qadam.",
            "all-mastered": "",
        } as Record<string, string>,
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
    const statusLabels: Record<string, string> = {
        not_started: t.notStarted, in_progress: t.inProgress, completed: t.done,
    };

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
                <StatCard title={t.streak} value={data.gamification.streak.current} icon={Flame} color="warning" description={`${t.longest}: ${data.gamification.streak.longest}`} />
                <StatCard title={t.mastered} value={data.metrics.mastered} icon={Trophy} color="success" description={`${data.metrics.mastered}/${data.metrics.total}`} />
                <StatCard title={t.available} value={data.metrics.available} icon={CheckCircle2} color="default" description={t.readyToLearn} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <Card className={`border-l-4 ${STATUS_STYLES[data.learningStatus.key] ?? "border-l-slate-400"}`}>
                    <CardHeader className="pb-3"><CardTitle className="text-base">{t.status}</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        <p className="text-2xl font-bold">{localize(data.learningStatus.label)}</p>
                        {data.learningStatus.openMisconceptions > 0 ? (
                            <p className="text-xs text-muted-foreground">
                                {data.learningStatus.openMisconceptions} {t.misconceptions}
                            </p>
                        ) : null}
                    </CardContent>
                </Card>

                <Card>
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
                                    <p className="mt-1 text-xs text-indigo-700">{t.reasons[data.nextLesson.reason] ?? ""}</p>
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
                    <CardTitle className="flex items-center gap-2 text-base">
                        <NotebookPen className="h-4 w-4" />{t.homework}
                        {data.homework.length ? <Badge variant="secondary">{data.homework.filter((item) => item.status !== "completed").length}</Badge> : null}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {data.homework.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t.noHomework}</p>
                    ) : (
                        <ul className="grid gap-3">
                            {data.homework.map((item) => (
                                <li key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${item.overdue ? "border-red-200 bg-red-50" : "bg-slate-50"}`}>
                                    <div className="min-w-0">
                                        <p className="font-semibold">{localize(item.title)}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {localize(item.topicTitle)} · {item.questionCount} {t.questions} · {t.due} {item.dueDate}
                                            {item.overdue ? ` · ${t.overdue}` : ""}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant={item.status === "completed" ? "secondary" : item.overdue ? "destructive" : "outline"}>
                                            {statusLabels[item.status]}{item.percentage !== null ? ` · ${item.percentage}%` : ""}
                                        </Badge>
                                        {item.status !== "completed" ? (
                                            <Button size="sm" asChild>
                                                <Link href={`/quiz?homeworkId=${item.id}&class=${data.profile.classLevel}`}>
                                                    {item.status === "in_progress" ? t.resume : t.start}
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
                            <span>{t.diagnostic}</span>
                            {data.diagnostic.overallCorrect !== null ? (
                                <Badge variant="outline">{data.diagnostic.overallCorrect} / {data.diagnostic.overallTotal}</Badge>
                            ) : null}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            {data.diagnostic.topicResults.map((topic) => (
                                <div key={topic.topicKey} className="rounded-lg border p-3">
                                    <p className="text-sm font-semibold">{localize(topic.title)}</p>
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

            <ConceptBrowser topics={data.topics} classLevel={data.profile.classLevel} locale={locale} />
        </DashboardLayout>
    );
}

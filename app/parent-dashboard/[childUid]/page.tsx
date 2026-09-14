"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { AlertCircle, AlertTriangle, ArrowLeft, BookOpen, Clock, Flame, NotebookPen, Sparkles, Target, Trophy } from "lucide-react";
import { ActiveTopicList } from "@/components/active-topics";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { auth } from "@/lib/firebase";
import { formatDuration } from "@/lib/learner-metrics";
import type { ChildDetail } from "@/lib/child-report";

const HOMEWORK_STATUS: Record<string, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" };

export default function ChildProgressPage() {
    const router = useRouter();
    const params = useParams<{ childUid: string }>();
    const childUid = params?.childUid ?? "";
    const [user, setUser] = useState<User | null>(null);
    const [child, setChild] = useState<ChildDetail | null>(null);
    const [error, setError] = useState("");

    useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
        if (!currentUser) return router.push("/login?role=parent");
        setUser(currentUser);
        setChild(null);
        setError("");
        try {
            const response = await fetch(`/api/parent/children/${encodeURIComponent(childUid)}`, {
                headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` },
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "This child's progress could not be loaded");
            setChild(data.child);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "This child's progress could not be loaded");
        }
    }), [router, childUid]);

    const layoutUser = { name: user?.displayName || "Parent", email: user?.email ?? "", role: "parent" as const };
    const back = (
        <Button variant="outline" size="sm" asChild>
            <Link href="/parent-dashboard"><ArrowLeft className="mr-2 h-4 w-4" />All children</Link>
        </Button>
    );

    if (error) return (
        <DashboardLayout user={layoutUser} onSignOut={() => signOut(auth).then(() => router.push("/"))}>
            <PageHeader title="Child progress" action={back} />
            <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert>
        </DashboardLayout>
    );

    if (!child) return (
        <DashboardLayout user={layoutUser} onSignOut={() => signOut(auth).then(() => router.push("/"))}>
            <Skeleton className="h-16 w-full" />
            <div className="grid gap-4 md:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
            <Skeleton className="h-72" />
        </DashboardLayout>
    );

    const m = child.metrics;
    return (
        <DashboardLayout user={layoutUser} onSignOut={() => signOut(auth).then(() => router.push("/"))}>
            <PageHeader
                title={child.name}
                description={`Class ${child.classLevel} · ${child.learningStatus.label.english}${child.lastActiveAt ? ` · Last active ${new Date(child.lastActiveAt).toLocaleDateString("en-PK", { dateStyle: "medium" })}` : ""}`}
                icon={<BookOpen className="h-6 w-6" />}
                action={back}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat icon={<Trophy className="h-4 w-4 text-emerald-600" />} label="Completed work" value={`${m.quizzesCompleted} quizzes`} detail={`${m.lessonsCompleted} lessons · ${m.conceptsMastered} of ${m.conceptsTotal} topics mastered`} />
                <Stat icon={<Target className="h-4 w-4 text-indigo-600" />} label="Accuracy" value={m.accuracyPercent === null ? "—" : `${m.accuracyPercent}%`} detail={`${m.correctAnswers} of ${m.questionsAnswered} answers correct`} />
                <Stat icon={<Clock className="h-4 w-4 text-amber-600" />} label="Time spent" value={formatDuration(m.timeSpentSeconds)} detail="On quizzes and tests" />
                <Stat icon={<Sparkles className="h-4 w-4 text-purple-600" />} label="XP and streak" value={`${m.xp} XP`} detail={`${m.streak}-day streak`} extra={<Flame className="h-4 w-4 text-amber-500" />} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">5 active topics</CardTitle></CardHeader>
                    <CardContent><ActiveTopicList topics={child.activeTopics} classLevel={child.classLevel} linkable={false} /></CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3"><CardTitle className="text-base">Progress by topic</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <div className="mb-1 flex justify-between text-sm"><span className="font-medium">Overall</span><span>{m.overallPercent}%</span></div>
                            <Progress value={m.overallPercent} className="h-2" aria-label="Overall progress" />
                        </div>
                        {child.topics.map((topic) => {
                            const percent = topic.total ? Math.round((topic.mastered / topic.total) * 100) : 0;
                            return (
                                <div key={topic.topicId}>
                                    <div className="mb-1 flex justify-between text-sm">
                                        <span>{topic.title.english}</span>
                                        <span className="text-muted-foreground">{topic.mastered} / {topic.total} mastered</span>
                                    </div>
                                    <Progress value={percent} className="h-1.5" aria-label={`${topic.title.english} ${percent}%`} />
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Recent quizzes</CardTitle></CardHeader>
                <CardContent>
                    {child.recentQuizzes.length === 0 ? <p className="text-sm text-muted-foreground">No quizzes completed yet.</p> : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-left text-sm">
                                <thead className="text-xs uppercase text-muted-foreground">
                                    <tr><th className="py-2">Topic</th><th className="py-2">Score</th><th className="py-2">Result</th><th className="py-2">Time</th><th className="py-2">Date</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {child.recentQuizzes.map((quiz) => (
                                        <tr key={quiz.sessionId}>
                                            <td className="py-2 font-medium">{quiz.topicName}</td>
                                            <td className="py-2">{quiz.score} / {quiz.maxScore}</td>
                                            <td className="py-2"><Badge variant={quiz.percentage >= 70 ? "secondary" : "outline"}>{quiz.percentage}%</Badge></td>
                                            <td className="py-2 text-muted-foreground">{quiz.timeSpentSeconds ? formatDuration(quiz.timeSpentSeconds) : "—"}</td>
                                            <td className="py-2 text-muted-foreground">{quiz.completedAt ? new Date(quiz.completedAt).toLocaleDateString("en-PK", { dateStyle: "medium" }) : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><NotebookPen className="h-4 w-4" />Homework</CardTitle></CardHeader>
                    <CardContent>
                        {child.homework.length === 0 ? <p className="text-sm text-muted-foreground">No homework assigned.</p> : (
                            <ul className="grid gap-2">
                                {child.homework.map((item) => (
                                    <li key={item.id} className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm ${item.overdue ? "border-red-200 bg-red-50" : ""}`}>
                                        <div>
                                            <p className="font-medium">{item.title}</p>
                                            <p className="text-xs text-muted-foreground">Due {item.dueDate}{item.overdue ? " · Overdue" : ""}</p>
                                        </div>
                                        <Badge variant={item.status === "completed" ? "secondary" : "outline"}>
                                            {HOMEWORK_STATUS[item.status] ?? item.status}{item.percentage !== null ? ` · ${item.percentage}%` : ""}
                                        </Badge>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-amber-600" />Repeated mistakes</CardTitle></CardHeader>
                    <CardContent>
                        {child.misconceptions.length === 0 ? <p className="text-sm text-muted-foreground">No repeated mistakes right now.</p> : (
                            <ul className="grid gap-2">
                                {child.misconceptions.map((item) => (
                                    <li key={`${item.microTag}-${item.label}`} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                                        <p className="font-medium">{item.label}</p>
                                        <p className="text-xs text-amber-900">In {item.topic} · seen {item.count} times</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}

function Stat({ icon, label, value, detail, extra }: { icon: React.ReactNode; label: string; value: string; detail: string; extra?: React.ReactNode }) {
    return (
        <Card>
            <CardContent className="p-4">
                <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{icon}{label}</p>
                <p className="flex items-center gap-1 text-2xl font-bold">{value}{extra}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
            </CardContent>
        </Card>
    );
}

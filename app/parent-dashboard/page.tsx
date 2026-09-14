"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { AlertCircle, ChevronRight, Clock, Target, Trophy, UserPlus, Users } from "lucide-react";
import { ActiveTopicList } from "@/components/active-topics";
import { EmptyState } from "@/components/empty-state";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { auth } from "@/lib/firebase";
import { formatDuration } from "@/lib/learner-metrics";
import type { ChildSummary } from "@/lib/child-report";

const STATUS_STYLES: Record<string, string> = {
    "on-track": "bg-emerald-100 text-emerald-800",
    "needs-practice": "bg-amber-100 text-amber-800",
    "needs-support": "bg-red-100 text-red-800",
    "getting-started": "bg-slate-100 text-slate-700",
};

export default function ParentDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [parentName, setParentName] = useState("");
    const [children, setChildren] = useState<ChildSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
        if (!currentUser) return router.push("/login?role=parent");
        setUser(currentUser);
        try {
            const response = await fetch("/api/parent/children", { headers: { Authorization: `Bearer ${await currentUser.getIdToken()}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "Your children could not be loaded");
            setParentName(data.parent?.name ?? "");
            setChildren(data.children ?? []);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Your children could not be loaded");
        } finally {
            setLoading(false);
        }
    }), [router]);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push("/");
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return (
        <DashboardLayout user={{ name: parentName || user?.displayName || "Parent", email: user?.email ?? "", role: "parent" }} onSignOut={handleSignOut}>
            <PageHeader
                title="Parent Dashboard"
                description="Your children's completed work, accuracy and time spent."
                icon={<Users className="h-6 w-6" />}
                action={
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                        <Link href="/parent-settings#link-child"><UserPlus className="h-4 w-4" />Link another child</Link>
                    </Button>
                }
            />

            {error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertDescription>{error}</AlertDescription></Alert> : null}

            {!error && children.length === 0 ? (
                <EmptyState
                    title="No children linked yet"
                    description="When your child signs up, ask them to enter your email address. Their progress will appear here automatically."
                    icon={UserPlus}
                >
                    <Button asChild><Link href="/parent-settings#link-child">How to link a child</Link></Button>
                </EmptyState>
            ) : null}

            <div className="grid gap-6">
                {children.map((child) => {
                    const href = `/parent-dashboard/${child.uid}`;
                    return (
                        <Card key={child.uid} className="overflow-hidden border-t-4 border-t-indigo-500">
                            <CardHeader className="border-b bg-slate-50/60">
                                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                                    <Link href={href} className="group flex items-center gap-4">
                                        <Avatar className="h-14 w-14 border-2 border-white shadow">
                                            <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-lg font-bold text-white">
                                                {child.name.charAt(0).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <CardTitle className="text-xl group-hover:text-primary group-hover:underline">{child.name}</CardTitle>
                                            <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
                                                <Badge variant="outline">Class {child.classLevel}</Badge>
                                                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[child.learningStatus.key] ?? ""}`}>
                                                    {child.learningStatus.label.english}
                                                </span>
                                            </CardDescription>
                                        </div>
                                    </Link>
                                    <Button asChild>
                                        <Link href={href}>View progress<ChevronRight className="ml-1 h-4 w-4" /></Link>
                                    </Button>
                                </div>

                                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                    <Metric icon={<Trophy className="h-4 w-4 text-emerald-600" />} label="Completed work"
                                        value={`${child.metrics.quizzesCompleted} quizzes`}
                                        detail={`${child.metrics.lessonsCompleted} lessons · ${child.metrics.conceptsMastered} topics mastered`} />
                                    <Metric icon={<Target className="h-4 w-4 text-indigo-600" />} label="Accuracy"
                                        value={child.metrics.accuracyPercent === null ? "—" : `${child.metrics.accuracyPercent}%`}
                                        detail={`${child.metrics.correctAnswers} of ${child.metrics.questionsAnswered} correct`} />
                                    <Metric icon={<Clock className="h-4 w-4 text-amber-600" />} label="Time spent"
                                        value={formatDuration(child.metrics.timeSpentSeconds)} detail="On quizzes and tests" />
                                    <div className="rounded-xl border bg-white p-3">
                                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">Overall progress</p>
                                        <p className="text-2xl font-bold">{child.metrics.overallPercent}%</p>
                                        <Progress value={child.metrics.overallPercent} className="mt-2 h-1.5" aria-label={`${child.name} overall progress`} />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-5">
                                <p className="mb-3 text-sm font-semibold">5 active topics</p>
                                <ActiveTopicList topics={child.activeTopics} classLevel={child.classLevel} linkable={false} />
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </DashboardLayout>
    );
}

function Metric({ icon, label, value, detail }: { icon: React.ReactNode; label: string; value: string; detail: string }) {
    return (
        <div className="rounded-xl border bg-white p-3">
            <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{icon}{label}</p>
            <p className="text-2xl font-bold">{value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </div>
    );
}

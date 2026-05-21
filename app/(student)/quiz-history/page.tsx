"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    History, CheckCircle2, AlertTriangle, Trophy, Clock,
    Lightbulb, TrendingUp, BookOpen, Calendar
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { StatCard } from "@/components/stat-card";

interface QuizResult {
    sessionId: string;
    topicName: string;
    score: number;
    maxScore: number;
    percentage: number;
    totalHintsUsed: number;
    totalTimeSeconds: number;
    understandingLevel: string;
    feedback: string;
    completedAt: any;
}

const LEVEL_STYLES: Record<string, { bg: string; text: string; border: string }> = {
    EXCELLENT: { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-400", border: "border-l-emerald-500" },
    GOOD:      { bg: "bg-blue-50 dark:bg-blue-950/20",    text: "text-blue-700 dark:text-blue-400",    border: "border-l-blue-500" },
    AVERAGE:   { bg: "bg-amber-50 dark:bg-amber-950/20",  text: "text-amber-700 dark:text-amber-400",  border: "border-l-amber-500" },
    WEAK:      { bg: "bg-red-50 dark:bg-red-950/20",      text: "text-red-700 dark:text-red-400",      border: "border-l-red-500" },
};

function formatSeconds(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function formatDate(ts: any): string {
    if (!ts) return "";
    const date = ts?.toDate ? ts.toDate() : new Date(ts);
    return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(date);
}

export default function QuizHistoryPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [results, setResults] = useState<QuizResult[]>([]);
    const [loading, setLoading] = useState(true);

    const handleSignOut = async () => { await signOut(auth); router.push("/"); };

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (cu) => {
            if (!cu) { router.push("/login?role=student"); return; }
            setUser(cu);
            try {
                const snap = await getDocs(collection(db, "students", cu.uid, "quizResults"));
                const list = snap.docs
                    .map(d => d.data() as QuizResult)
                    .sort((a, b) => {
                        const aDate = a.completedAt?.toDate?.() || new Date(a.completedAt || 0);
                        const bDate = b.completedAt?.toDate?.() || new Date(b.completedAt || 0);
                        return bDate.getTime() - aDate.getTime();
                    });
                setResults(list);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        });
        return () => unsub();
    }, [router]);

    const avgScore = results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + r.percentage, 0) / results.length)
        : 0;
    const totalHints = results.reduce((sum, r) => sum + (r.totalHintsUsed || 0), 0);
    const bestScore = results.length > 0 ? Math.max(...results.map(r => r.percentage)) : 0;
    const excellentCount = results.filter(r => r.understandingLevel === "EXCELLENT").length;

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <DashboardLayout
            user={{ name: user?.displayName || "Student", email: user?.email || "", role: "student" }}
            onSignOut={handleSignOut}
        >
            <PageHeader
                title="Quiz History"
                description="Review all your past quizzes and see how you've improved over time."
                icon={<History className="h-6 w-6" />}
                action={
                    <Badge variant="secondary" className="px-3 py-1">{results.length} Quizzes</Badge>
                }
            />

            {/* Stats row */}
            {results.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <StatCard title="Avg Score" value={`${avgScore}%`} icon={TrendingUp} color="primary" trend="neutral" trendValue="overall" />
                    <StatCard title="Best Score" value={`${bestScore}%`} icon={Trophy} color="success" trend="up" trendValue="personal best" />
                    <StatCard title="Excellent Results" value={excellentCount} icon={CheckCircle2} color="success" description="Full marks quizzes" />
                    <StatCard title="Hints Used" value={totalHints} icon={Lightbulb} color="warning" description="Across all quizzes" />
                </div>
            )}

            {results.length === 0 ? (
                <EmptyState
                    title="No Quizzes Yet"
                    description="Complete your first quiz from the Learn Topics page to see your history here."
                    icon={BookOpen}
                />
            ) : (
                <div className="grid gap-4">
                    <AnimatePresence>
                        {results.map((r, i) => {
                            const style = LEVEL_STYLES[r.understandingLevel] || LEVEL_STYLES["AVERAGE"];
                            const scoreColor = r.percentage >= 80 ? "text-emerald-600" : r.percentage >= 60 ? "text-amber-600" : "text-red-600";
                            return (
                                <motion.div
                                    key={r.sessionId}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <Card className={`border-l-4 ${style.border} shadow-sm hover:shadow-md transition-shadow`}>
                                        <CardContent className="p-5">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${style.bg}`}>
                                                        {r.percentage >= 80 ? <Trophy className={`h-5 w-5 ${style.text}`} />
                                                            : r.percentage >= 60 ? <TrendingUp className={`h-5 w-5 ${style.text}`} />
                                                                : <AlertTriangle className={`h-5 w-5 ${style.text}`} />}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-sm">{r.topicName}</h3>
                                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                            <Badge className={`text-[10px] h-4 px-1.5 border-0 ${style.bg} ${style.text}`}>
                                                                {r.understandingLevel}
                                                            </Badge>
                                                            {r.completedAt && (
                                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                    <Calendar className="h-3 w-3" />{formatDate(r.completedAt)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-6">
                                                    <div className="text-right">
                                                        <p className={`text-2xl font-black ${scoreColor}`}>{r.percentage}%</p>
                                                        <p className="text-xs text-muted-foreground">{r.score}/{r.maxScore} correct</p>
                                                    </div>
                                                    <div className="hidden sm:block text-right">
                                                        <p className="text-sm font-medium flex items-center gap-1">
                                                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />{formatSeconds(r.totalTimeSeconds)}
                                                        </p>
                                                        {r.totalHintsUsed > 0 && (
                                                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 justify-end">
                                                                <Lightbulb className="h-3 w-3" />{r.totalHintsUsed} hint{r.totalHintsUsed > 1 ? "s" : ""}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Score bar */}
                                            <div className="mt-4">
                                                <Progress
                                                    value={r.percentage}
                                                    className={`h-1.5 ${r.percentage >= 80 ? "[&>div]:bg-emerald-500" : r.percentage >= 60 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
                                                />
                                            </div>

                                            {r.feedback && (
                                                <p className="mt-3 text-xs text-muted-foreground italic leading-relaxed line-clamp-2">
                                                    "{r.feedback}"
                                                </p>
                                            )}
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}
        </DashboardLayout>
    );
}

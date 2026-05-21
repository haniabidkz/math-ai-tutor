"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { calculateClassStats } from "@/lib/understanding";
import { ClassLevel, UnderstandingLevel } from "@/types/user";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from "next/link";
import {
    GraduationCap,
    Users,
    Search,
    AlertTriangle,
    TrendingUp,
    BookOpen,
    Clock,
    CheckCircle2,
    BarChart3,
    Filter,
    Trophy,
    BrainCog,
    Lightbulb,
    ChevronRight,
    Target
} from "lucide-react";

interface StudentData {
    uid: string;
    name: string;
    email: string;
    class: ClassLevel;
    parentEmail?: string;
    adaptive_level?: number;
    topicProgress: Array<{
        topicName: string;
        teachingLevel: number;
        teachingAttempts: number;
        needsHumanAttention: boolean;
        understood: boolean;
        understandingLevel?: UnderstandingLevel;
    }>;
    quizResults: Array<{
        topicName: string;
        score: number;
        maxScore: number;
        percentage: number;
        understandingLevel: string;
        totalHintsUsed: number;
        totalTimeSeconds: number;
        completedAt: string;
    }>;
}

export default function TeacherDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [students, setStudents] = useState<StudentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedClass, setSelectedClass] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                router.push("/login?role=teacher");
                return;
            }
            setUser(currentUser);

            try {
                const studentsSnapshot = await getDocs(collection(db, "students"));
                const studentList: StudentData[] = [];

                for (const studentDoc of studentsSnapshot.docs) {
                    const data = studentDoc.data();
                    const uid = studentDoc.id;

                    // Fetch topic progress
                    const progressSnapshot = await getDocs(collection(db, "students", uid, "topicProgress"));
                    const topicProgress = progressSnapshot.docs.map((d) => d.data()) as StudentData["topicProgress"];

                    // Fetch quiz results
                    const quizSnapshot = await getDocs(collection(db, "students", uid, "quizResults"));
                    const quizResults = quizSnapshot.docs.map((d) => {
                        const qData = d.data();
                        return {
                            ...qData,
                            completedAt: qData.completedAt?.toDate?.()?.toISOString?.() || "",
                        };
                    }) as StudentData["quizResults"];

                    studentList.push({
                        uid,
                        name: data.name,
                        email: data.email,
                        class: data.class,
                        parentEmail: data.parentEmail,
                        adaptive_level: data.adaptive_level,
                        topicProgress,
                        quizResults,
                    });
                }

                setStudents(studentList);
            } catch (err) {
                console.error("Fetch error:", err);
            } finally {
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [router]);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push("/");
    };

    // Filter Logic
    const filteredStudents = students.filter((s) => {
        const matchesClass = selectedClass === "all" || s.class.toString() === selectedClass;
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.email.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesClass && matchesSearch;
    });

    // Stats Calculation
    const classStats = calculateClassStats(
        filteredStudents.map((s) => {
            const levels = s.topicProgress.map((t) => t.understandingLevel).filter(Boolean) as UnderstandingLevel[];
            const overallLevel = levels.length > 0
                ? (levels.includes("WEAK") ? "WEAK" : levels.includes("AVERAGE") ? "AVERAGE" : levels.includes("GOOD") ? "GOOD" : "EXCELLENT")
                : "AVERAGE";
            return {
                studentUid: s.uid,
                studentName: s.name,
                understandingLevel: overallLevel as UnderstandingLevel,
                needsAttention: s.topicProgress.some((t) => t.needsHumanAttention),
            };
        })
    );

    // Initial Class Selection
    useEffect(() => {
        if (students.length > 0 && selectedClass === "all") {
            // Find most populated class
            const classCounts: Record<string, number> = {};
            students.forEach(s => { classCounts[s.class.toString()] = (classCounts[s.class.toString()] || 0) + 1 });
            const sorted = Object.entries(classCounts).sort(([, a], [, b]) => b - a);
            if (sorted.length > 0) setSelectedClass(sorted[0][0]);
        }
    }, [students, selectedClass]);


    if (loading) {
        return <div className="min-h-screen flex items-center justify-center"><div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;
    }

    return (
        <DashboardLayout
            user={{ name: user?.displayName || "Teacher", email: user?.email || "", role: "teacher" }}
            onSignOut={handleSignOut}
        >
            <PageHeader
                title="Teacher Dashboard"
                description="Overview of student performance and attention areas."
                icon={<GraduationCap className="h-6 w-6" />}
                action={
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="px-3 py-1">
                            {filteredStudents.length} Students
                        </Badge>
                    </div>
                }
            />

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <StatCard
                    title="Class Size"
                    value={classStats.totalStudents}
                    icon={Users}
                    color="primary"
                    trend="neutral"
                    trendValue="Active Learners"
                />
                <StatCard
                    title="Needs Attention"
                    value={classStats.studentsNeedingAttention.length}
                    icon={AlertTriangle}
                    color={classStats.studentsNeedingAttention.length > 0 ? "danger" : "success"}
                    description={classStats.studentsNeedingAttention.length > 0 ? "Students struggling with topics" : "Everyone is on track!"}
                />
                <StatCard
                    title="Excellent"
                    value={classStats.excellentCount}
                    icon={Trophy}
                    color="success"
                    trend="up"
                    trendValue="High Performers"
                />
                <StatCard
                    title="On Track"
                    value={classStats.goodCount + classStats.averageCount}
                    icon={TrendingUp}
                    color="primary"
                    description="Students making steady progress"
                />
            </div>

            {/* Attention Banner */}
            {classStats.studentsNeedingAttention.length > 0 && (
                <Alert variant="destructive" className="mb-8 border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Attention Needed</AlertTitle>
                    <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <span>
                            The following students are struggling:{" "}
                            <span className="font-semibold">{classStats.studentsNeedingAttention.join(", ")}</span>
                        </span>
                        <Link
                            href="/teacher-attention"
                            className="inline-flex items-center gap-1 text-xs font-semibold underline underline-offset-2 shrink-0"
                        >
                            View Detailed Report <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    </AlertDescription>
                </Alert>
            )}

            {/* Main Content Tabs */}
            <Tabs defaultValue="overview" className="space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="students">Students</TabsTrigger>
                        <TabsTrigger value="insights">Insights</TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="search"
                                placeholder="Search students..."
                                className="pl-9 h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="h-4 w-4 text-muted-foreground" />
                            <select
                                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={selectedClass}
                                onChange={(e) => setSelectedClass(e.target.value)}
                            >
                                <option value="all">All Classes</option>
                                {[...new Set(students.map(s => s.class))].sort().map(c => (
                                    <option key={c} value={c.toString()}>Class {c}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <TabsContent value="overview" className="space-y-6 animate-in fade-in-50">
                    {filteredStudents.length === 0 ? (
                        <EmptyState
                            title="No Students Found"
                            description="Try adjusting your filters or search query."
                            icon={Users}
                        />
                    ) : (
                        <div className="grid gap-6">
                            {/* Topic Performance Chart (Mocked with progress bars for now) */}
                            <Card>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <BarChart3 className="h-5 w-5 text-primary" />
                                        Topic Performance
                                    </CardTitle>
                                    <CardDescription>Average class understanding per topic</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    {getTopicStats(filteredStudents).map(([topic, stats]) => (
                                        <div key={topic} className="space-y-1">
                                            <div className="flex justify-between text-sm">
                                                <span className="font-medium">{topic}</span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-muted-foreground">{stats.percent}% Mastered</span>
                                                    {stats.needsHelp > 0 && (
                                                        <Badge variant="destructive" className="h-5 text-[10px] px-1.5">
                                                            {stats.needsHelp} need help
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <Progress value={stats.percent} className={`h-2 ${stats.percent < 50 ? "text-amber-500" : "text-emerald-500"}`} />
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="students" className="animate-in fade-in-50">
                    <Card>
                        <CardHeader>
                            <CardTitle>Student List</CardTitle>
                            <CardDescription>Detailed view of each student's progress</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Accordion type="single" collapsible className="w-full">
                                {filteredStudents.map((student) => {
                                    const levels = student.topicProgress.map((t) => t.understandingLevel).filter(Boolean) as UnderstandingLevel[];
                                    const overallLevel = levels.length > 0
                                        ? (levels.includes("WEAK") ? "WEAK" : levels.includes("AVERAGE") ? "AVERAGE" : levels.includes("GOOD") ? "GOOD" : "EXCELLENT")
                                        : "AVERAGE";
                                    const badgeVariant = overallLevel === "EXCELLENT" ? "default" : overallLevel === "GOOD" ? "secondary" : overallLevel === "AVERAGE" ? "outline" : "destructive";

                                    return (
                                        <AccordionItem key={student.uid} value={student.uid} className="border-b last:border-0 px-6">
                                            <AccordionTrigger className="hover:no-underline py-4">
                                                <div className="flex items-center gap-4 w-full">
                                                    <Avatar className="h-8 w-8">
                                                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                                            {student.name.charAt(0)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="text-left flex-1">
                                                        <p className="font-medium text-sm leading-none">{student.name}</p>
                                                        <p className="text-xs text-muted-foreground mt-1">Class {student.class}</p>
                                                    </div>
                                                    <div className="flex items-center gap-4 mr-4">
                                                        <div className="text-right hidden sm:block">
                                                            <p className="text-xs font-medium">{student.topicProgress.filter(t => t.understood).length} Topics</p>
                                                            <p className="text-[10px] text-muted-foreground">Completed</p>
                                                        </div>
                                                        <Badge variant={badgeVariant} className="w-20 justify-center">
                                                            {overallLevel}
                                                        </Badge>
                                                    </div>
                                                </div>
                                            </AccordionTrigger>
                                            <AccordionContent className="pb-6 pt-2">
                                                <div className="grid md:grid-cols-2 gap-4">
                                                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg">
                                                        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Topic Progress</h4>
                                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                                            {student.topicProgress.map((tp, i) => (
                                                                <div key={i} className="flex justify-between items-center text-sm">
                                                                    <span className="truncate max-w-[180px]">{tp.topicName}</span>
                                                                    <div className="flex items-center gap-2">
                                                                        {tp.needsHumanAttention && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                                                                        {tp.understood && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                                                                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">{tp.understandingLevel || "N/A"}</Badge>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg">
                                                        <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-3">Recent Quizzes</h4>
                                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                                                            {student.quizResults.slice(-5).reverse().map((qr, i) => (
                                                                <div key={i} className="flex justify-between items-center text-sm">
                                                                    <span className="truncate max-w-[150px]">{qr.topicName}</span>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-xs">{qr.percentage}%</span>
                                                                        <span className="text-[10px] text-muted-foreground">{new Date(qr.completedAt).toLocaleDateString()}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {student.quizResults.length === 0 && <p className="text-xs text-muted-foreground">No quizzes taken yet.</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                                {student.parentEmail && (
                                                    <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                                                        <Users className="h-3 w-3" /> Parent: <span className="text-foreground">{student.parentEmail}</span>
                                                    </div>
                                                )}
                                            </AccordionContent>
                                        </AccordionItem>
                                    );
                                })}
                            </Accordion>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="insights" className="space-y-6 animate-in fade-in-50">
                    {/* Level Distribution */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Target className="h-5 w-5 text-primary" /> Understanding Distribution
                                </CardTitle>
                                <CardDescription>How students are performing overall</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {(["EXCELLENT", "GOOD", "AVERAGE", "WEAK"] as const).map(lvl => {
                                    const count = filteredStudents.filter(s => {
                                        const levels = s.topicProgress.map(t => t.understandingLevel).filter(Boolean) as UnderstandingLevel[];
                                        if (!levels.length) return false;
                                        const overall = levels.includes("WEAK") ? "WEAK" : levels.includes("AVERAGE") ? "AVERAGE" : levels.includes("GOOD") ? "GOOD" : "EXCELLENT";
                                        return overall === lvl;
                                    }).length;
                                    const pct = filteredStudents.length > 0 ? Math.round((count / filteredStudents.length) * 100) : 0;
                                    const colors: Record<string, string> = {
                                        EXCELLENT: "bg-emerald-500", GOOD: "bg-blue-500",
                                        AVERAGE: "bg-amber-500", WEAK: "bg-red-500"
                                    };
                                    return (
                                        <div key={lvl}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium capitalize">{lvl.toLowerCase()}</span>
                                                <span className="text-muted-foreground">{count} students ({pct}%)</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className={`h-full ${colors[lvl]} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <BrainCog className="h-5 w-5 text-indigo-500" /> Adaptive Level Distribution
                                </CardTitle>
                                <CardDescription>Students at each adaptive difficulty level</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {[1, 2, 3, 4, 5].map(lvl => {
                                    const count = filteredStudents.filter(s => (s.adaptive_level ?? 0) === lvl).length;
                                    const pct = filteredStudents.length > 0 ? Math.round((count / filteredStudents.length) * 100) : 0;
                                    return (
                                        <div key={lvl}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium">Level {lvl}</span>
                                                <span className="text-muted-foreground">{count} students ({pct}%)</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Topic Difficulty Map */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <Lightbulb className="h-5 w-5 text-amber-500" /> Topic Difficulty Map
                            </CardTitle>
                            <CardDescription>Topics sorted by class mastery rate — tackle the hardest ones first</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {getTopicStats(filteredStudents).map(([topic, stats]) => {
                                    const pct = stats.percent;
                                    const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
                                    return (
                                        <div key={topic}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-sm">{topic}</span>
                                                <div className="flex items-center gap-2">
                                                    {stats.needsHelp > 0 && (
                                                        <Badge variant="destructive" className="text-[10px] h-4 px-1.5">
                                                            {stats.needsHelp} stuck
                                                        </Badge>
                                                    )}
                                                    <span className={`text-xs font-bold ${pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                                                        {pct}% mastered
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Hint Usage Insight */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-base">
                                <BarChart3 className="h-5 w-5 text-blue-500" /> Quiz Performance Summary
                            </CardTitle>
                            <CardDescription>Average scores per student across all completed quizzes</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {filteredStudents
                                    .filter(s => s.quizResults.length > 0)
                                    .map(s => {
                                        const avg = Math.round(s.quizResults.reduce((acc, r) => acc + r.percentage, 0) / s.quizResults.length);
                                        const totalHints = s.quizResults.reduce((acc, r) => acc + (r.totalHintsUsed || 0), 0);
                                        return (
                                            <div key={s.uid} className="flex items-center gap-4">
                                                <div className="w-28 shrink-0 text-sm font-medium truncate">{s.name}</div>
                                                <div className="flex-1">
                                                    <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${avg >= 80 ? "bg-emerald-500" : avg >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                                                            style={{ width: `${avg}%` }}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-sm font-bold w-10 text-right">{avg}%</span>
                                                    {totalHints > 0 && (
                                                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5">
                                                            <Lightbulb className="h-2.5 w-2.5" />{totalHints}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                {filteredStudents.every(s => s.quizResults.length === 0) && (
                                    <p className="text-sm text-muted-foreground text-center py-4">No quiz results available yet.</p>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </DashboardLayout>
    );
}

// Helper to aggregate topic stats
function getTopicStats(students: StudentData[]) {
    const stats = new Map<string, { total: number; understood: number; needsHelp: number }>();
    students.forEach(s => {
        s.topicProgress.forEach(t => {
            const existing = stats.get(t.topicName) || { total: 0, understood: 0, needsHelp: 0 };
            existing.total++;
            if (t.understood) existing.understood++;
            if (t.needsHumanAttention) existing.needsHelp++;
            stats.set(t.topicName, existing);
        });
    });

    return Array.from(stats.entries()).map(([topic, data]) => [topic, {
        ...data,
        percent: data.total > 0 ? Math.round((data.understood / data.total) * 100) : 0
    }] as const).sort((a, b) => a[1].percent - b[1].percent);
}

function TrophyIcon(props: any) {
    return <GraduationCap {...props} />
}

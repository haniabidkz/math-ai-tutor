"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ClassLevel, UnderstandingLevel } from "@/types/user";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
    GraduationCap, Search, Filter, CheckCircle2, AlertTriangle,
    Clock, BookOpen, Trophy, Users, BrainCog, BarChart3
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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
        quizScore?: number;
        quizMaxScore?: number;
    }>;
    quizResults: Array<{
        topicName: string;
        score: number;
        maxScore: number;
        percentage: number;
        understandingLevel: string;
        totalHintsUsed: number;
    }>;
}

const LEVEL_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    EXCELLENT: { color: "text-emerald-700", bg: "bg-emerald-100 dark:bg-emerald-900/30", label: "Excellent" },
    GOOD:      { color: "text-blue-700",    bg: "bg-blue-100 dark:bg-blue-900/30",    label: "Good" },
    AVERAGE:   { color: "text-amber-700",   bg: "bg-amber-100 dark:bg-amber-900/30",   label: "Average" },
    WEAK:      { color: "text-red-700",     bg: "bg-red-100 dark:bg-red-900/30",     label: "Weak" },
};

export default function TeacherStudentsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [students, setStudents] = useState<StudentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [classFilter, setClassFilter] = useState("all");
    const [levelFilter, setLevelFilter] = useState("all");

    const handleSignOut = async () => { await signOut(auth); router.push("/"); };

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) { router.push("/login?role=teacher"); return; }
            setUser(currentUser);
            try {
                const snap = await getDocs(collection(db, "students"));
                const list: StudentData[] = [];
                for (const d of snap.docs) {
                    const data = d.data();
                    const [progSnap, quizSnap] = await Promise.all([
                        getDocs(collection(db, "students", d.id, "topicProgress")),
                        getDocs(collection(db, "students", d.id, "quizResults")),
                    ]);
                    list.push({
                        uid: d.id,
                        name: data.name,
                        email: data.email,
                        class: data.class,
                        parentEmail: data.parentEmail,
                        adaptive_level: data.adaptive_level,
                        topicProgress: progSnap.docs.map(p => p.data()) as StudentData["topicProgress"],
                        quizResults: quizSnap.docs.map(q => q.data()) as StudentData["quizResults"],
                    });
                }
                setStudents(list.sort((a, b) => a.class - b.class));
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        });
        return () => unsub();
    }, [router]);

    const getOverallLevel = (student: StudentData): string => {
        const levels = student.topicProgress.map(t => t.understandingLevel).filter(Boolean) as UnderstandingLevel[];
        if (!levels.length) return "N/A";
        if (levels.includes("WEAK")) return "WEAK";
        if (levels.includes("AVERAGE")) return "AVERAGE";
        if (levels.includes("GOOD")) return "GOOD";
        return "EXCELLENT";
    };

    const filteredStudents = students.filter(s => {
        const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.email.toLowerCase().includes(search.toLowerCase());
        const matchClass = classFilter === "all" || s.class.toString() === classFilter;
        const matchLevel = levelFilter === "all" || getOverallLevel(s) === levelFilter;
        return matchSearch && matchClass && matchLevel;
    });

    const avgAccuracy = (student: StudentData) => {
        if (!student.quizResults.length) return null;
        return Math.round(student.quizResults.reduce((sum, r) => sum + r.percentage, 0) / student.quizResults.length);
    };

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <DashboardLayout
            user={{ name: user?.displayName || "Teacher", email: user?.email || "", role: "teacher" }}
            onSignOut={handleSignOut}
        >
            <PageHeader
                title="All Students"
                description="Comprehensive view of every student's performance and progress."
                icon={<GraduationCap className="h-6 w-6" />}
                action={
                    <Badge variant="secondary" className="px-3 py-1">
                        {filteredStudents.length} of {students.length} Students
                    </Badge>
                }
            />

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by name or email..."
                        className="pl-9"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                    <select
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={classFilter}
                        onChange={e => setClassFilter(e.target.value)}
                    >
                        <option value="all">All Classes</option>
                        {[...new Set(students.map(s => s.class))].sort().map(c => (
                            <option key={c} value={c.toString()}>Class {c}</option>
                        ))}
                    </select>
                    <select
                        className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={levelFilter}
                        onChange={e => setLevelFilter(e.target.value)}
                    >
                        <option value="all">All Levels</option>
                        <option value="EXCELLENT">Excellent</option>
                        <option value="GOOD">Good</option>
                        <option value="AVERAGE">Average</option>
                        <option value="WEAK">Weak</option>
                    </select>
                </div>
            </div>

            {filteredStudents.length === 0 ? (
                <EmptyState title="No Students Found" description="Try adjusting your search or filters." icon={Users} />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <Accordion type="multiple" className="w-full">
                            {filteredStudents.map((student, idx) => {
                                const overallLevel = getOverallLevel(student);
                                const cfg = LEVEL_CONFIG[overallLevel];
                                const completedCount = student.topicProgress.filter(t => t.understood).length;
                                const attentionCount = student.topicProgress.filter(t => t.needsHumanAttention).length;
                                const accuracy = avgAccuracy(student);
                                const progressPct = student.topicProgress.length > 0
                                    ? Math.round((completedCount / student.topicProgress.length) * 100)
                                    : 0;

                                return (
                                    <AccordionItem key={student.uid} value={student.uid} className="border-b last:border-0">
                                        <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-slate-50/50 dark:hover:bg-slate-900/20">
                                            <div className="flex items-center gap-4 w-full">
                                                <Avatar className="h-10 w-10 shrink-0">
                                                    <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-sm font-bold">
                                                        {student.name.charAt(0)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="text-left flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="font-semibold text-sm">{student.name}</p>
                                                        {attentionCount > 0 && (
                                                            <Badge variant="destructive" className="text-[10px] h-4 px-1.5 gap-1">
                                                                <AlertTriangle className="h-2.5 w-2.5" />{attentionCount} stuck
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">{student.email}</p>
                                                </div>
                                                <div className="flex items-center gap-3 mr-2 shrink-0">
                                                    <div className="text-right hidden md:block">
                                                        <p className="text-xs font-medium">{progressPct}%</p>
                                                        <p className="text-[10px] text-muted-foreground">Progress</p>
                                                    </div>
                                                    <Badge variant="outline" className="h-5 text-[10px] px-1.5">Class {student.class}</Badge>
                                                    {student.adaptive_level && (
                                                        <Badge className="h-5 text-[10px] px-1.5 bg-indigo-100 text-indigo-700 border-0">
                                                            Lvl {student.adaptive_level}
                                                        </Badge>
                                                    )}
                                                    {cfg && (
                                                        <Badge className={`h-5 text-[10px] px-1.5 border-0 ${cfg.bg} ${cfg.color}`}>
                                                            {overallLevel}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        </AccordionTrigger>

                                        <AccordionContent className="px-6 pb-6 pt-2">
                                            {/* Progress Bar */}
                                            <div className="mb-5">
                                                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                                                    <span>Topic Progress</span>
                                                    <span>{completedCount} / {student.topicProgress.length} completed</span>
                                                </div>
                                                <Progress value={progressPct} className="h-2" />
                                            </div>

                                            <div className="grid md:grid-cols-3 gap-3 mb-5">
                                                <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900 rounded-lg p-3 text-center">
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
                                                    <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{completedCount}</div>
                                                    <div className="text-xs text-emerald-600 dark:text-emerald-500">Mastered</div>
                                                </div>
                                                <div className="bg-slate-50 dark:bg-slate-900/50 border rounded-lg p-3 text-center">
                                                    <BarChart3 className="h-4 w-4 text-primary mx-auto mb-1" />
                                                    <div className="text-xl font-bold">{accuracy !== null ? `${accuracy}%` : "—"}</div>
                                                    <div className="text-xs text-muted-foreground">Avg Quiz Score</div>
                                                </div>
                                                <div className={`border rounded-lg p-3 text-center ${attentionCount > 0 ? "bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900" : "bg-slate-50 dark:bg-slate-900/50"}`}>
                                                    <AlertTriangle className={`h-4 w-4 mx-auto mb-1 ${attentionCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
                                                    <div className={`text-xl font-bold ${attentionCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}>{attentionCount}</div>
                                                    <div className="text-xs text-muted-foreground">Need Help</div>
                                                </div>
                                            </div>

                                            {/* Topic breakdown */}
                                            <div className="space-y-2">
                                                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Topics</h4>
                                                <div className="grid gap-2 max-h-56 overflow-y-auto pr-1">
                                                    {student.topicProgress.map((tp, i) => {
                                                        const tCfg = tp.understandingLevel ? LEVEL_CONFIG[tp.understandingLevel] : null;
                                                        return (
                                                            <div key={i} className={`flex items-center justify-between text-sm px-3 py-2 rounded-lg border ${tp.needsHumanAttention ? "bg-red-50 border-red-100 dark:bg-red-950/10 dark:border-red-900/50" : "bg-slate-50 dark:bg-slate-900/30"}`}>
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    {tp.understood ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                                                        : tp.needsHumanAttention ? <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                                            : <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                                                                    <span className="truncate font-medium text-xs">{tp.topicName}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <span className="text-[10px] text-muted-foreground">{tp.teachingAttempts} tries</span>
                                                                    {tCfg && (
                                                                        <Badge className={`text-[9px] h-4 px-1 border-0 ${tCfg.bg} ${tCfg.color}`}>
                                                                            {tp.understandingLevel}
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            {student.parentEmail && (
                                                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 dark:bg-slate-900/30 rounded-lg px-3 py-2 border">
                                                    <Users className="h-3 w-3" />
                                                    Parent: <span className="font-medium text-foreground">{student.parentEmail}</span>
                                                </div>
                                            )}
                                        </AccordionContent>
                                    </AccordionItem>
                                );
                            })}
                        </Accordion>
                    </CardContent>
                </Card>
            )}
        </DashboardLayout>
    );
}

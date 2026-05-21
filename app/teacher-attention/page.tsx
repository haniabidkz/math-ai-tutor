"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, User } from "firebase/auth";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    AlertTriangle, GraduationCap, CheckCircle2, BookOpen,
    Clock, Users, Search, Lightbulb, ArrowLeft, RefreshCw,
    ChevronRight, BrainCog
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { signOut } from "firebase/auth";

interface StudentData {
    uid: string;
    name: string;
    email: string;
    class: ClassLevel;
    parentEmail?: string;
    adaptive_level?: number;
    topicProgress: Array<{
        topicId: string;
        topicName: string;
        teachingLevel: number;
        teachingAttempts: number;
        needsHumanAttention: boolean;
        understood: boolean;
        understandingLevel?: UnderstandingLevel;
    }>;
}

export default function TeacherAttentionPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [students, setStudents] = useState<StudentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    const handleSignOut = async () => {
        await signOut(auth);
        router.push("/");
    };

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) { router.push("/login?role=teacher"); return; }
            setUser(currentUser);
            try {
                const snap = await getDocs(collection(db, "students"));
                const list: StudentData[] = [];
                for (const d of snap.docs) {
                    const data = d.data();
                    const progSnap = await getDocs(collection(db, "students", d.id, "topicProgress"));
                    list.push({
                        uid: d.id,
                        name: data.name,
                        email: data.email,
                        class: data.class,
                        parentEmail: data.parentEmail,
                        adaptive_level: data.adaptive_level,
                        topicProgress: progSnap.docs.map(p => p.data()) as StudentData["topicProgress"],
                    });
                }
                setStudents(list);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        });
        return () => unsub();
    }, [router]);

    const studentsNeedingAttention = students
        .map(s => ({
            ...s,
            attentionTopics: s.topicProgress.filter(t => t.needsHumanAttention),
        }))
        .filter(s => s.attentionTopics.length > 0)
        .filter(s => s.name.toLowerCase().includes(search.toLowerCase()) ||
            s.email.toLowerCase().includes(search.toLowerCase()));

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
                title="Attention Needed"
                description="Students who could not understand topics after 3 explanations — they need your help."
                icon={<AlertTriangle className="h-6 w-6 text-amber-500" />}
                action={
                    <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="px-3 py-1 text-sm animate-pulse">
                            {studentsNeedingAttention.length} Students
                        </Badge>
                        <Button variant="outline" size="sm" asChild>
                            <Link href="/teacher-dashboard">
                                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Overview
                            </Link>
                        </Button>
                    </div>
                }
            />

            {/* Summary banner */}
            {studentsNeedingAttention.length > 0 && (
                <Alert className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    <AlertTitle className="text-amber-800 dark:text-amber-400">Action Required</AlertTitle>
                    <AlertDescription className="text-amber-700 dark:text-amber-500">
                        The AI tutor has exhausted its 3 teaching approaches for these students.
                        Human intervention is needed. Consider scheduling 1:1 sessions or notifying parents.
                    </AlertDescription>
                </Alert>
            )}

            {/* Search */}
            <div className="relative mb-6 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search students..."
                    className="pl-9"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {studentsNeedingAttention.length === 0 ? (
                <EmptyState
                    title="No Students Need Attention"
                    description="Great news! All students are progressing well with the AI tutor right now."
                    icon={CheckCircle2}
                />
            ) : (
                <div className="grid gap-6">
                    <AnimatePresence>
                        {studentsNeedingAttention.map((student, idx) => (
                            <motion.div
                                key={student.uid}
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.06 }}
                            >
                                <Card className="border-l-4 border-l-amber-500 shadow-md overflow-hidden">
                                    <CardHeader className="bg-amber-50/50 dark:bg-amber-950/10 pb-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="flex items-center gap-4">
                                                <Avatar className="h-12 w-12 border-2 border-white shadow">
                                                    <AvatarFallback className="bg-gradient-to-br from-amber-500 to-orange-500 text-white font-bold">
                                                        {student.name.charAt(0)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div>
                                                    <CardTitle className="text-lg">{student.name}</CardTitle>
                                                    <CardDescription className="flex items-center gap-2 mt-1">
                                                        <Badge variant="outline">Class {student.class}</Badge>
                                                        {student.adaptive_level && (
                                                            <Badge className="bg-indigo-100 text-indigo-700 border-0 text-xs">
                                                                <BrainCog className="h-3 w-3 mr-1" />Level {student.adaptive_level}
                                                            </Badge>
                                                        )}
                                                        <span className="text-xs text-muted-foreground">{student.email}</span>
                                                    </CardDescription>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="destructive" className="gap-1">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    {student.attentionTopics.length} Topic{student.attentionTopics.length > 1 ? "s" : ""}
                                                </Badge>
                                                {student.parentEmail && (
                                                    <Badge variant="secondary" className="text-xs gap-1">
                                                        <Users className="h-3 w-3" />
                                                        Parent linked
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="p-0">
                                        <Accordion type="single" collapsible defaultValue="topics">
                                            <AccordionItem value="topics" className="border-none">
                                                <AccordionTrigger className="px-6 py-3 text-sm font-medium text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-900/30">
                                                    View struggling topics &amp; suggested actions
                                                </AccordionTrigger>
                                                <AccordionContent className="px-6 pb-6">
                                                    <div className="grid gap-4">
                                                        {student.attentionTopics.map((topic, i) => (
                                                            <div key={i} className="rounded-xl border bg-red-50/30 dark:bg-red-950/10 p-4 space-y-3">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <div>
                                                                        <p className="font-semibold text-sm">{topic.topicName}</p>
                                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                                            {topic.teachingAttempts} AI explanations tried
                                                                            (Level 1: Simple → Level 2: Examples → Level 3: Story)
                                                                        </p>
                                                                    </div>
                                                                    <Badge variant="destructive" className="shrink-0 text-[10px]">
                                                                        STUCK
                                                                    </Badge>
                                                                </div>

                                                                {/* Teaching level breakdown */}
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    {["Simple English", "Daily Examples", "Story Method"].map((method, j) => (
                                                                        <div key={j} className={`text-center p-2 rounded-lg text-xs border ${j < topic.teachingAttempts
                                                                            ? "bg-red-100 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900"
                                                                            : "bg-slate-100 border-slate-200 text-slate-400"}`}>
                                                                            <div className="font-bold mb-0.5">{j + 1}</div>
                                                                            {method}
                                                                            {j < topic.teachingAttempts && " ✗"}
                                                                        </div>
                                                                    ))}
                                                                </div>

                                                                {/* Suggested actions */}
                                                                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 space-y-1.5">
                                                                    <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
                                                                        <Lightbulb className="h-3.5 w-3.5" /> Suggested Teacher Actions
                                                                    </p>
                                                                    <ul className="text-xs text-blue-700 dark:text-blue-400 space-y-1 pl-4 list-disc">
                                                                        <li>Schedule a 5-min 1:1 session on <strong>{topic.topicName}</strong></li>
                                                                        <li>Use visual aids or physical objects (e.g., blocks, charts)</li>
                                                                        {student.parentEmail && (
                                                                            <li>Notify parent at <strong>{student.parentEmail}</strong> to practice at home</li>
                                                                        )}
                                                                        <li>Consider peer tutoring with a stronger student in Class {student.class}</li>
                                                                    </ul>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </AccordionContent>
                                            </AccordionItem>
                                        </Accordion>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </DashboardLayout>
    );
}

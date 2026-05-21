"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { generateUnderstandingSummary } from "@/lib/understanding";
import { ParentProfile, StudentProfile, TopicProgress, UnderstandingLevel } from "@/types/user";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
    Users,
    UserPlus,
    GraduationCap,
    TrendingUp,
    AlertCircle,
    CheckCircle2,
    Clock,
    ChevronDown,
    ChevronUp,
    LayoutDashboard
} from "lucide-react";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { motion, AnimatePresence } from "framer-motion";

interface ChildData extends StudentProfile {
    uid: string;
    progress: TopicProgress[];
}

export default function ParentDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<ParentProfile | null>(null);
    const [children, setChildren] = useState<ChildData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                router.push("/login?role=parent");
                return;
            }

            setUser(currentUser);

            try {
                // Fetch parent profile
                const profileDoc = await getDoc(doc(db, "parents", currentUser.uid));
                if (profileDoc.exists()) {
                    const parentData = profileDoc.data() as ParentProfile;
                    setProfile(parentData);

                    // Fetch linked children
                    const q = query(
                        collection(db, "students"),
                        where("parentEmail", "==", parentData.email)
                    );
                    const querySnapshot = await getDocs(q);

                    const childrenData: ChildData[] = [];

                    for (const childDoc of querySnapshot.docs) {
                        const child = childDoc.data() as StudentProfile;

                        // Fetch progress for each child
                        const progressQuery = await getDocs(
                            collection(db, "students", childDoc.id, "topicProgress")
                        );

                        const progress: TopicProgress[] = [];
                        progressQuery.forEach(p => progress.push(p.data() as TopicProgress));

                        childrenData.push({
                            ...child,
                            uid: childDoc.id,
                            progress
                        });
                    }

                    setChildren(childrenData);
                }
            } catch (error) {
                console.error("Error fetching data:", error);
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

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!profile) {
        return (
            <DashboardLayout
                user={{
                    name: user?.displayName || "Parent",
                    email: user?.email || "",
                    role: "parent",
                }}
                onSignOut={handleSignOut}
            >
                <div className="flex flex-col items-center justify-center py-20 space-y-6">
                    <div className="w-20 h-20 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-4xl">
                        👨‍👩‍👧
                    </div>
                    <div className="text-center space-y-2 max-w-md">
                        <h2 className="text-2xl font-bold">Parent Profile Not Found</h2>
                        <p className="text-muted-foreground">
                            It looks like your account doesn't have a parent profile yet.
                            Please sign up as a parent first, or make sure you're logged in with the correct account.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={handleSignOut}>
                            Sign Out
                        </Button>
                        <Button onClick={() => router.push("/login?role=parent")}>
                            Sign Up as Parent
                        </Button>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout
            user={{
                name: profile.name,
                email: profile.email,
                role: "parent",
            }}
            onSignOut={handleSignOut}
        >
            <PageHeader
                title="Parent Dashboard"
                description="Track your children's learning progress and achievements."
                icon={<Users className="h-6 w-6" />}
                action={
                    children.length > 0 && <Button variant="outline" size="sm" className="gap-2">
                        <UserPlus className="h-4 w-4" /> Link Another Child
                    </Button>
                }
            />

            {children.length === 0 ? (
                <EmptyState
                    title="No Children Linked Yet"
                    description="When your child signs up, ask them to enter your email address. Their progress will automatically appear here!"
                    icon={UserPlus}
                >
                    <div className="mt-6 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300 max-w-md mx-auto text-left">
                        <p className="font-semibold mb-2 flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            How to link your child:
                        </p>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Ask your child to <strong>Sign Up</strong> as a Student.</li>
                            <li>In the sign-up form, have them enter <strong>{profile.email}</strong> in the "Parent's Email" field.</li>
                            <li>That's it! Refresh this page to see their progress.</li>
                        </ol>
                    </div>
                </EmptyState>
            ) : (
                <div className="grid gap-8 stagger-fade">
                    {children.map((child) => {
                        const completedTopics = child.progress.filter(p => p.understood).length;
                        const needsHelpTopics = child.progress.filter(p => p.needsHumanAttention).length;
                        const totalTopics = 10; // Assuming ~10 topics per class for now or dynamic
                        const progressPercent = Math.min(100, Math.round((completedTopics / totalTopics) * 100));

                        return (
                            <Card key={child.uid} className="overflow-hidden border-t-4 border-t-indigo-500 shadow-lg">
                                <CardHeader className="bg-slate-50/50 dark:bg-slate-900/50 pb-8 border-b">
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                        <div className="flex items-center gap-4">
                                            <Avatar className="h-16 w-16 border-2 border-white shadow-md">
                                                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xl font-bold">
                                                    {child.name.charAt(0)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <CardTitle className="text-xl">{child.name}</CardTitle>
                                                <CardDescription className="flex items-center gap-2 mt-1">
                                                    <Badge variant="outline" className="font-normal">Class {child.class}</Badge>
                                                    <span className="text-xs text-muted-foreground">•</span>
                                                    <span className="text-xs text-muted-foreground">{child.email}</span>
                                                </CardDescription>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {needsHelpTopics > 0 && (
                                                <Badge variant="destructive" className="px-3 py-1 text-sm gap-1 animate-pulse">
                                                    <AlertCircle className="h-3 w-3" /> Needs Attention
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                        <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border shadow-sm">
                                            <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wide mb-2">
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                Topics Mastered
                                            </div>
                                            <div className="text-2xl font-bold">{completedTopics}</div>
                                            <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progressPercent}%` }} />
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border shadow-sm">
                                            <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wide mb-2">
                                                <AlertCircle className="h-4 w-4 text-amber-500" />
                                                Needs Help in
                                            </div>
                                            <div className="text-2xl font-bold">{needsHelpTopics}</div>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {needsHelpTopics > 0 ? "Check 'Details' below" : "Doing great!"}
                                            </p>
                                        </div>

                                        <div className="bg-white dark:bg-slate-950 p-4 rounded-xl border shadow-sm">
                                            <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wide mb-2">
                                                <TrendingUp className="h-4 w-4 text-indigo-500" />
                                                Current Status
                                            </div>
                                            <div className="text-2xl font-bold">
                                                {progressPercent > 70 ? "Excellent" : progressPercent > 40 ? "On Track" : "Getting Started"}
                                            </div>
                                            <Badge variant={progressPercent > 70 ? "default" : "secondary"} className="mt-1">
                                                {progressPercent}% curriculum
                                            </Badge>
                                        </div>
                                    </div>
                                </CardHeader>

                                <CardContent className="p-0">
                                    <Accordion type="single" collapsible>
                                        <AccordionItem value="details" className="border-none">
                                            <AccordionTrigger className="px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                                                <span className="text-sm font-medium text-muted-foreground">View Detailed Progress</span>
                                            </AccordionTrigger>
                                            <AccordionContent className="px-6 pb-6">
                                                {child.progress.length > 0 ? (
                                                    <div className="grid gap-3">
                                                        {child.progress.map((p, idx) => {
                                                            const levelColor = p.understandingLevel === "EXCELLENT" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                                                                : p.understandingLevel === "GOOD" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                                                    : p.understandingLevel === "AVERAGE" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                                                        : p.understandingLevel === "WEAK" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400";

                                                            const statusMsg = p.understood
                                                                ? "Your child has mastered this topic! 🎉"
                                                                : p.needsHumanAttention
                                                                    ? `The AI tutor has tried ${p.teachingAttempts} different explanations, but your child still needs help. Consider discussing this topic with their teacher.`
                                                                    : p.teachingAttempts > 1
                                                                        ? `Working through this topic — the tutor has tried ${p.teachingAttempts} explanation style(s) so far.`
                                                                        : "Just started learning this topic.";

                                                            return (
                                                                <div key={idx} className="rounded-xl border bg-card/50 overflow-hidden">
                                                                    {/* Topic Header */}
                                                                    <div className="flex items-center justify-between p-4">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className={`p-2 rounded-full ${p.understood ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" :
                                                                                p.needsHumanAttention ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30" :
                                                                                    "bg-blue-100 text-blue-600 dark:bg-blue-900/30"
                                                                                }`}>
                                                                                {p.understood ? <CheckCircle2 className="h-4 w-4" /> :
                                                                                    p.needsHumanAttention ? <AlertCircle className="h-4 w-4" /> :
                                                                                        <Clock className="h-4 w-4" />}
                                                                            </div>
                                                                            <div>
                                                                                <span className="font-semibold text-sm block">{p.topicName}</span>
                                                                                <span className="text-xs text-muted-foreground">
                                                                                    {p.teachingAttempts} teaching attempt{p.teachingAttempts !== 1 ? "s" : ""}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            {p.understandingLevel && (
                                                                                <Badge className={`${levelColor} border-0 text-[10px] font-bold px-2`}>
                                                                                    {p.understandingLevel}
                                                                                </Badge>
                                                                            )}
                                                                            <Badge variant={
                                                                                p.understood ? "outline" :
                                                                                    p.needsHumanAttention ? "destructive" :
                                                                                        "secondary"
                                                                            }>
                                                                                {p.understood ? "Mastered" :
                                                                                    p.needsHumanAttention ? "Needs Help" :
                                                                                        "In Progress"}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                    {/* Detail Row */}
                                                                    <div className="px-4 pb-3">
                                                                        <p className={`text-xs leading-relaxed rounded-lg p-2.5 ${p.needsHumanAttention
                                                                            ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                                                                            : "bg-slate-50 text-muted-foreground dark:bg-slate-900/50"
                                                                            }`}>
                                                                            {statusMsg}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <p className="text-sm text-muted-foreground text-center py-4">No topics started yet.</p>
                                                )}
                                            </AccordionContent>
                                        </AccordionItem>
                                    </Accordion>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </DashboardLayout>
    );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { StudentProfile, TopicProgress } from "@/types/user";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
    BookOpen,
    CheckCircle2,
    HandHelping,
    ChevronRight,
    Trophy,
    LayoutDashboard,
    AlertCircle,
    Clock
} from "lucide-react";
import { motion } from "framer-motion";

// Math topics organized by class (Same as before)
const TOPICS_BY_CLASS: Record<number, string[]> = {
    1: ["Counting (1-100)", "Addition (Single Digit)", "Subtraction (Single Digit)", "Shapes"],
    2: ["Addition (Two Digits)", "Subtraction (Two Digits)", "Skip Counting", "Time (Hours)"],
    3: ["Multiplication Tables", "Division Basics", "Fractions Introduction", "Money"],
    4: ["Multi-digit Multiplication", "Long Division", "Fractions", "Decimals Introduction"],
    5: ["Fractions & Decimals", "Percentage Basics", "Geometry", "Data Handling"],
    6: ["Integers", "Algebra Basics", "Ratio & Proportion", "Area & Perimeter"],
    7: ["Algebraic Expressions", "Linear Equations", "Triangles", "Probability"],
    8: ["Polynomials", "Quadrilaterals", "Statistics", "Exponents"],
    9: ["Real Numbers", "Coordinate Geometry", "Surface Area & Volume", "Trigonometry Intro"],
    10: ["Quadratic Equations", "Arithmetic Sequences", "Circles", "Trigonometry"],
};

export default function StudentDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<StudentProfile | null>(null);
    const [progress, setProgress] = useState<TopicProgress[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!currentUser) {
                router.push("/login?role=student");
                return;
            }

            setUser(currentUser);

            const profileDoc = await getDoc(doc(db, "students", currentUser.uid));
            if (profileDoc.exists()) {
                const profileData = profileDoc.data() as StudentProfile;
                if (!profileData.placementCompleted) {
                    router.push("/placement");
                    return;
                }
                setProfile(profileData);
            }

            const progressSnapshot = await getDocs(
                collection(db, "students", currentUser.uid, "topicProgress")
            );
            const progressData: TopicProgress[] = [];
            progressSnapshot.forEach((doc) => {
                progressData.push(doc.data() as TopicProgress);
            });
            setProgress(progressData);

            setLoading(false);
        });

        return () => unsubscribe();
    }, [router]);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push("/");
    };

    const getTopicStatus = (topicName: string) => {
        const topicProgress = progress.find((p) => p.topicName === topicName);
        if (!topicProgress) return { status: "new", icon: BookOpen, label: "Start learning", color: "bg-slate-500", border: "border-l-slate-400" };
        if (topicProgress.needsHumanAttention) return { status: "attention", icon: HandHelping, label: "Needs teacher help", color: "bg-amber-500", border: "border-l-amber-500" };
        if (topicProgress.understood) return { status: "completed", icon: CheckCircle2, label: "Completed", color: "bg-emerald-500", border: "border-l-emerald-500" };
        return { status: "in-progress", icon: Clock, label: "In Progress", color: "bg-indigo-500", border: "border-l-indigo-500" };
    };

    if (loading || !profile || !user) {
        return (
            <div className="min-h-screen bg-slate-50/50 p-8">
                <div className="max-w-7xl mx-auto space-y-8">
                    <div className="flex justify-between items-center">
                        <Skeleton className="h-12 w-64" />
                        <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map((i) => (
                            <Skeleton key={i} className="h-32 rounded-xl" />
                        ))}
                    </div>
                    <div className="space-y-4">
                        <Skeleton className="h-8 w-48" />
                        {[1, 2, 3, 4].map((i) => (
                            <Skeleton key={i} className="h-20 rounded-xl" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const topics = profile?.class ? TOPICS_BY_CLASS[profile.class] || [] : [];
    const completedCount = progress.filter((p) => p.understood).length;
    const inProgressCount = progress.filter((p) => !p.understood && !p.needsHumanAttention).length;
    const needHelpCount = progress.filter((p) => p.needsHumanAttention).length;

    return (
        <DashboardLayout
            user={{
                name: profile.name,
                email: profile.email,
                role: "student",
                classLevel: profile.class,
            }}
            onSignOut={handleSignOut}
        >
            <PageHeader
                title={
                    <div className="flex items-center gap-3">
                        Welcome back, {profile.name.split(" ")[0]}!
                        {profile.adaptive_level && (
                            <Badge variant="default" className="text-sm px-3 py-1 bg-indigo-600 hover:bg-indigo-700 shadow-md">
                                Level {profile.adaptive_level}
                            </Badge>
                        )}
                    </div>
                }
                description="Ready to solve some problems today?"
                icon={<LayoutDashboard className="h-6 w-6" />}
            />

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stagger-fade">
                <StatCard
                    title="Completed Topics"
                    value={completedCount}
                    icon={Trophy}
                    color="success"
                    description={`${Math.round((completedCount / (topics.length || 1)) * 100)}% of curriculum`}
                />
                <StatCard
                    title="In Progress"
                    value={inProgressCount}
                    icon={BookOpen}
                    color="primary"
                    description="Keep going!"
                />
                <StatCard
                    title="Need Help"
                    value={needHelpCount}
                    icon={HandHelping}
                    color="warning"
                    description={needHelpCount > 0 ? "Ask your teacher" : "Great job!"}
                />
            </div>

            {/* Topics Section */}
            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold tracking-tight">Your Topics</h2>
                    <Badge variant="outline" className="px-3 py-1">Class {profile.class}</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
                    {topics.map((topic, index) => {
                        const { status, icon: Icon, label, color, border } = getTopicStatus(topic);
                        const topicId = `class${profile?.class}_topic${index}`;

                        return (
                            <motion.div
                                key={topicId}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                            >
                                <Link href={`/learn?topic=${encodeURIComponent(topic)}&topicId=${topicId}&class=${profile.class}`}>
                                    <Card className={`group hover:shadow-md transition-all duration-200 border-l-4 ${border} overflow-hidden`}>
                                        <CardContent className="p-0">
                                            <div className="flex items-center p-4 gap-4">
                                                <div className={`p-3 rounded-xl ${color} bg-opacity-10 text-opacity-100 flex-shrink-0`}>
                                                    <Icon className={`h-6 w-6 ${color.replace("bg-", "text-")}`} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                                                        {topic}
                                                    </h3>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {label}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {status === "completed" && (
                                                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
                                                            Mastered
                                                        </Badge>
                                                    )}
                                                    {status === "attention" && (
                                                        <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400">
                                                            Help Needed
                                                        </Badge>
                                                    )}
                                                    <ChevronRight className="h-5 w-5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </section>
        </DashboardLayout>
    );
}

// Helper component for StatCard total display logic if needed specifically for dashboard
// But generic StatCard should handle basic value display.
// I'll update StatCard call above to pass simple value and put description as "x/y total" logic

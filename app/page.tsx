"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
    BookOpen,
    Sparkles,
    BarChart3,
    GraduationCap,
    Users,
    School,
    ArrowRight,
    Calculator,
    BrainCircuit,
    Trophy
} from "lucide-react";

export default function Home() {
    const roles = [
        {
            id: "student",
            title: "Student",
            icon: GraduationCap,
            description: "Learn math with AI help, take quizzes, and track your progress.",
            href: "/login?role=student",
            color: "text-indigo-600 dark:text-indigo-400",
            bg: "bg-indigo-50 dark:bg-indigo-900/20",
            border: "hover:border-indigo-500",
        },
        {
            id: "parent",
            title: "Parent",
            icon: Users,
            description: "Monitor your child's learning journey and view detailed insights.",
            href: "/login?role=parent",
            color: "text-emerald-600 dark:text-emerald-400",
            bg: "bg-emerald-50 dark:bg-emerald-900/20",
            border: "hover:border-emerald-500",
        },
        {
            id: "teacher",
            title: "Teacher",
            icon: School,
            description: "Manage classes, view student performance, and identify needs.",
            href: "/login?role=teacher",
            color: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-50 dark:bg-amber-900/20",
            border: "hover:border-amber-500",
        },
    ];

    const features = [
        {
            title: "AI Personal Tutor",
            description: "Get instant, patient explanations tailored to your learning style.",
            icon: Sparkles,
            color: "text-purple-500",
        },
        {
            title: "Adaptive Quizzes",
            description: "Questions that adapt to your level to help you master concepts.",
            icon: BrainCircuit,
            color: "text-blue-500",
        },
        {
            title: "Real-time Progress",
            description: "Track your improvements and celebrate every milestone.",
            icon: Trophy,
            color: "text-amber-500",
        },
    ];

    return (
        <div className="min-h-screen flex flex-col bg-slate-50/50 dark:bg-slate-950">
            {/* Navbar */}
            <header className="fixed top-0 w-full z-50 glass-header px-6 py-4">
                <div className="container mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="bg-primary/10 p-2 rounded-lg text-primary">
                            <Calculator className="h-6 w-6" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">SMART Tutor</span>
                    </div>
                    <div className="flex gap-4">
                        <Button variant="ghost" asChild>
                            <Link href="/login">Sign In</Link>
                        </Button>
                        <Button asChild>
                            <Link href="/login?role=student">Get Started</Link>
                        </Button>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <main className="flex-1 pt-32 pb-16 px-6">
                <div className="container mx-auto max-w-6xl">
                    <div className="text-center space-y-6 mb-16 relative">
                        {/* Decorative background blobs */}
                        <motion.div
                            animate={{
                                scale: [1, 1.1, 1],
                                opacity: [0.3, 0.5, 0.3],
                            }}
                            transition={{ duration: 8, repeat: Infinity }}
                            className="absolute -top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] -z-10 pointer-events-none"
                        />

                        <Badge variant="secondary" className="px-4 py-1.5 text-sm font-medium rounded-full border-primary/20 bg-primary/5 text-primary">
                            ✨ AI-Powered Personalized Learning
                        </Badge>

                        <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-slate-900 dark:text-white">
                            Master Math with <br />
                            <span className="gradient-text">Confidence</span>
                        </h1>

                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                            A patient, encouraging AI tutor that explains concepts clearly,
                            tracks your understanding, and helps you learn at your own pace.
                        </p>
                    </div>

                    {/* Role Selection Cards */}
                    <div className="grid md:grid-cols-3 gap-6 mb-24 stagger-fade">
                        {roles.map((role) => (
                            <Link key={role.id} href={role.href} className="group">
                                <Card className={`h-full border-2 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${role.border}`}>
                                    <CardHeader>
                                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${role.bg} ${role.color}`}>
                                            <role.icon className="h-7 w-7" />
                                        </div>
                                        <CardTitle className="text-2xl">{role.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground leading-relaxed">
                                            {role.description}
                                        </p>
                                        <div className="mt-6 flex items-center gap-2 font-medium text-sm transition-colors group-hover:text-primary">
                                            Get Started <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>

                    {/* Features Section */}
                    <div className="grid md:grid-cols-3 gap-8">
                        {features.map((feature, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                viewport={{ once: true }}
                            >
                                <Card className="border-none shadow-none bg-transparent">
                                    <CardHeader>
                                        <div className={`p-3 w-fit rounded-xl bg-slate-100 dark:bg-slate-800 mb-2 ${feature.color}`}>
                                            <feature.icon className="h-6 w-6" />
                                        </div>
                                        <CardTitle className="text-lg">{feature.title}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-muted-foreground">
                                            {feature.description}
                                        </p>
                                    </CardContent>
                                </Card>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="py-8 border-t bg-slate-50 dark:bg-slate-900">
                <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
                    <p>&copy; {new Date().getFullYear()} SMART Math Tutor. Powered by AI.</p>
                </div>
            </footer>
        </div>
    );
}

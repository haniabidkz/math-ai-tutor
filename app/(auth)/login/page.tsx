"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { signInEmailFor } from "@/lib/phone";
import { UserRole } from "@/types/user";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Loader2, AlertCircle, Mail, Lock, User, GraduationCap, ArrowRight, BookOpen, Users2, School, Phone, Building2, KeyRound } from "lucide-react";

type PortalRole = "student" | "parent" | "teacher" | "school";

/** Firebase's codes, in words a parent or child understands. */
function friendlyAuthError(error: unknown): string {
    const code = String((error as { code?: string }).code ?? "");
    if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email"].includes(code)) return "The phone/email or the password is wrong. Please check and try again.";
    if (code === "auth/user-disabled") return "This account is deactivated. Please contact your school or support.";
    if (code === "auth/too-many-requests") return "Too many attempts. Please wait a few minutes and try again.";
    if (code === "auth/network-request-failed") return "No connection. Check your internet and try again.";
    return error instanceof Error ? error.message.replace("Firebase: ", "") : "Something went wrong. Please try again.";
}

/** Where an account goes after signing in, from its claims; the portal tab is the fallback. */
function homeFor(claims: Record<string, unknown>, portal: PortalRole): string {
    if (claims.super_admin === true) return "/super-admin";
    const role = typeof claims.role === "string" ? claims.role : null;
    if (role === "school_admin") return "/school-admin";
    if (role === "student") return "/dashboard";
    if (role === "teacher" || role === "parent") return `/${role}-dashboard`;
    if (portal === "school") return "/school-admin";
    return portal === "student" ? "/dashboard" : `/${portal}-dashboard`;
}

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedRole = searchParams.get("role");
    const role: PortalRole = requestedRole === "parent" || requestedRole === "teacher" || requestedRole === "school" ? requestedRole : "student";
    const signupRole: Exclude<UserRole, "super_admin" | "school_admin"> = role === "school" ? "student" : role;

    // "Get Started" on the landing page lands on the sign-up form straight away; the school portal signs in only.
    const [isSignUp, setIsSignUp] = useState(searchParams.get("mode") === "signup" && role !== "school");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Form fields
    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");
    const [name, setName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [classLevel, setClassLevel] = useState<string>("6");
    const [parentContact, setParentContact] = useState("");
    const [schoolCode, setSchoolCode] = useState(searchParams.get("code") ?? "");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            if (isSignUp) {
                // The server creates the account, so the school code, seats and field rules are checked there.
                const parentIsEmail = parentContact.includes("@");
                const response = await fetch("/api/auth/signup", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        role: signupRole,
                        name: name.trim(),
                        phone,
                        email: email.trim() || undefined,
                        password,
                        ...(signupRole === "student" ? {
                            classLevel: Number(classLevel),
                            schoolCode: schoolCode.trim() || undefined,
                            parentEmail: parentIsEmail ? parentContact.trim() : undefined,
                            parentPhone: !parentIsEmail && parentContact.trim() ? parentContact.trim() : undefined,
                        } : {}),
                    }),
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "The account could not be created");
                await signInWithEmailAndPassword(auth, data.signInEmail, password);
                router.replace(signupRole === "student" ? "/placement" : `/${signupRole}-dashboard`);
            } else {
                const target = signInEmailFor(identifier);
                if ("error" in target) throw new Error(target.error);
                const credential = await signInWithEmailAndPassword(auth, target.email, password);
                const token = await credential.user.getIdTokenResult(true);
                router.push(homeFor(token.claims as Record<string, unknown>, role));
            }
        } catch (err) {
            console.error("Auth error:", err);
            setError(friendlyAuthError(err));
        } finally {
            setLoading(false);
        }
    };

    const roleConfig = {
        student: {
            label: "Student Portal",
            emoji: "📚",
            description: "Log in to access your dashboard and start learning.",
            gradient: "from-indigo-600 to-violet-600",
            bg: "bg-indigo-50 dark:bg-indigo-950/30",
            illustration: "🎓",
        },
        parent: {
            label: "Parent Portal",
            emoji: "👨‍👩‍👧",
            description: "View your child's progress and learning insights.",
            gradient: "from-emerald-600 to-teal-600",
            bg: "bg-emerald-50 dark:bg-emerald-950/30",
            illustration: "📊",
        },
        teacher: {
            label: "Teacher Portal",
            emoji: "👩‍🏫",
            description: "Manage your classroom and track student performance.",
            gradient: "from-amber-600 to-orange-600",
            bg: "bg-amber-50 dark:bg-amber-950/30",
            illustration: "🍎",
        },
        school: {
            label: "School Portal",
            emoji: "🏫",
            description: "Manage your school's teachers, classes, sections and students.",
            gradient: "from-sky-600 to-cyan-600",
            bg: "bg-sky-50 dark:bg-sky-950/30",
            illustration: "🏫",
        },
    };

    const config = roleConfig[role];
    const fieldClass = "pl-10 h-12 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl";
    const labelClass = "text-xs font-bold uppercase tracking-wider text-muted-foreground ml-1";

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-slate-50 dark:bg-slate-950">
            {/* Left Panel - Hero/Illustration */}
            <div className={`hidden lg:flex flex-col justify-between p-12 relative overflow-hidden bg-gradient-to-br ${config.gradient}`}>
                <div className="relative z-10">
                    <Link href="/" className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors group">
                        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" /> Back to Home
                    </Link>
                </div>

                <div className="relative z-10 text-white space-y-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-md border border-white/20 flex items-center justify-center text-5xl shadow-2xl"
                    >
                        {config.illustration}
                    </motion.div>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                    >
                        <h1 className="text-5xl font-extrabold mb-4 tracking-tight drop-shadow-md">{config.label}</h1>
                        <p className="text-xl text-white/90 max-w-md leading-relaxed font-medium">{config.description}</p>
                    </motion.div>
                </div>

                {/* Decorative Background Circles */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-white/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 animate-pulse-glow" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/20 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3" />
            </div>

            {/* Right Panel - Form */}
            <div className={`flex flex-col items-center justify-center p-6 lg:p-12 relative ${config.bg}`}>
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className={`absolute top-1/4 left-1/4 w-64 h-64 opacity-20 blur-3xl rounded-full bg-gradient-to-r ${config.gradient} animate-float`} />
                </div>

                <div className="w-full max-w-[420px] space-y-8 relative z-10">
                    {/* Mobile Header */}
                    <div className="lg:hidden flex items-center justify-between mb-8">
                        <Link href="/" className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-slate-200 dark:hover:bg-slate-800">
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                        <Badge variant="outline" className="text-xs py-1.5 px-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border-slate-200 dark:border-slate-800 shadow-sm font-semibold rounded-full">
                            {config.emoji} {config.label}
                        </Badge>
                    </div>

                    <Card className="border border-slate-200/60 dark:border-slate-800/60 shadow-2xl bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl rounded-[2rem] overflow-hidden">
                        <div className={`h-2 w-full bg-gradient-to-r ${config.gradient}`} />
                        <CardHeader className="space-y-2 pt-8 pb-4 text-center px-8">
                            <CardTitle className="text-3xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-br from-slate-900 to-slate-500 dark:from-white dark:to-slate-400">
                                {isSignUp ? "Create Account" : "Welcome Back"}
                            </CardTitle>
                            <CardDescription className="text-base">
                                {isSignUp
                                    ? "Enter your details to get started"
                                    : role === "school" ? "Sign in with your school admin phone number" : "Enter your phone number or email to login"}
                            </CardDescription>

                            {/* Role Switcher */}
                            {role !== "school" ? (
                                <div className="pt-3">
                                    <div className="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-900/60 rounded-2xl p-1.5 border border-slate-200/60 dark:border-slate-800/60">
                                        {([
                                            { role: "student", label: "Student", icon: BookOpen, gradient: "from-indigo-500 to-violet-500" },
                                            { role: "parent",  label: "Parent",  icon: Users2,   gradient: "from-emerald-500 to-teal-500" },
                                            { role: "teacher", label: "Teacher", icon: School,   gradient: "from-amber-500 to-orange-500" },
                                        ] as const).map((r) => {
                                            const Icon = r.icon;
                                            const isActive = role === r.role;
                                            return (
                                                <Link
                                                    key={r.role}
                                                    href={`/login?role=${r.role}${isSignUp ? "&mode=signup" : ""}`}
                                                    className={`relative flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                                                        isActive
                                                            ? "bg-white dark:bg-slate-800 shadow-sm text-slate-900 dark:text-white"
                                                            : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-slate-800/50"
                                                    }`}
                                                >
                                                    {isActive && (
                                                        <span className={`absolute inset-0 rounded-xl bg-gradient-to-r ${r.gradient} opacity-10`} />
                                                    )}
                                                    <Icon className="h-3.5 w-3.5 shrink-0 relative"
                                                        style={isActive ? { stroke: r.role === "student" ? "#6366f1" : r.role === "parent" ? "#10b981" : "#f59e0b" } : {}}
                                                    />
                                                    <span className="relative">{r.label}</span>
                                                </Link>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}
                        </CardHeader>
                        <CardContent className="px-8 pb-8">
                            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                                <AnimatePresence mode="popLayout">
                                    {error && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                            animate={{ opacity: 1, scale: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                        >
                                            <Alert variant="destructive" className="border-red-500/50 bg-red-50/50 dark:bg-red-950/20 shadow-sm rounded-xl">
                                                <AlertCircle className="h-4 w-4" />
                                                <AlertDescription className="font-medium">{error}</AlertDescription>
                                            </Alert>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="space-y-4">
                                    {isSignUp ? (
                                        <>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="name" className={labelClass}>Full Name</Label>
                                                <div className="relative group">
                                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                    <Input id="name" placeholder="Ali Ahmed" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} className={fieldClass} />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="phone" className={labelClass}>Mobile Number</Label>
                                                <div className="relative group">
                                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                    <Input id="phone" type="tel" inputMode="tel" placeholder="03001234567" value={phone} onChange={(e) => setPhone(e.target.value)} required className={fieldClass} />
                                                </div>
                                                <p className="ml-1 text-[11px] text-muted-foreground">You will sign in with this number. No code is sent to it.</p>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="email" className={labelClass}>Email <span className="opacity-70 font-normal lowercase tracking-normal">(optional)</span></Label>
                                                <div className="relative group">
                                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                    <Input id="email" type="email" placeholder="m@example.com" value={email} onChange={(e) => setEmail(e.target.value)} className={fieldClass} />
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="space-y-1.5">
                                            <Label htmlFor="identifier" className={labelClass}>Phone or Email</Label>
                                            <div className="relative group">
                                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                <Input
                                                    id="identifier"
                                                    placeholder="03001234567 or m@example.com"
                                                    value={identifier}
                                                    onChange={(e) => setIdentifier(e.target.value)}
                                                    required
                                                    autoComplete="username"
                                                    className={fieldClass}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-1.5">
                                        <Label htmlFor="password" className={labelClass}>Password</Label>
                                        <div className="relative group">
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                            <Input
                                                id="password"
                                                type="password"
                                                placeholder={isSignUp ? "At least 6 characters" : "Enter your password"}
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                required
                                                minLength={6}
                                                autoComplete={isSignUp ? "new-password" : "current-password"}
                                                className={fieldClass}
                                            />
                                        </div>
                                        {!isSignUp ? <p className="ml-1 text-[11px] text-muted-foreground"><KeyRound className="mr-1 inline h-3 w-3" />Forgot it? Your school or LearnAI Tutor support can reset it.</p> : null}
                                    </div>

                                    {isSignUp && signupRole === "student" && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="space-y-4 pt-2"
                                        >
                                            <div className="space-y-1.5">
                                                <Label htmlFor="class" className={labelClass}>Class Level</Label>
                                                <div className="relative group">
                                                    <GraduationCap className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                                                    <Select value={classLevel} onValueChange={setClassLevel}>
                                                        <SelectTrigger className={fieldClass}>
                                                            <SelectValue placeholder="Select class" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {[6, 7, 8].map((c) => (
                                                                <SelectItem key={c} value={String(c)}>
                                                                    Class {c}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label htmlFor="schoolCode" className={labelClass}>
                                                    School Code <span className="opacity-70 font-normal lowercase tracking-normal">(optional)</span>
                                                </Label>
                                                <div className="relative group">
                                                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                    <Input id="schoolCode" placeholder="e.g. EAGLE-6" value={schoolCode} onChange={(e) => setSchoolCode(e.target.value.toUpperCase())} className={`${fieldClass} uppercase`} />
                                                </div>
                                                <p className="ml-1 text-[11px] text-muted-foreground">Got a code from your school? Enter it to join your school. Leave it blank to learn on your own.</p>
                                            </div>

                                            <div className="space-y-1.5">
                                                <Label htmlFor="parentContact" className={labelClass}>
                                                    Parent&apos;s Phone or Email <span className="opacity-70 font-normal lowercase tracking-normal">(optional)</span>
                                                </Label>
                                                <div className="relative group">
                                                    <Users2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                                    <Input id="parentContact" placeholder="03001234567 or parent@example.com" value={parentContact} onChange={(e) => setParentContact(e.target.value)} className={fieldClass} />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>

                                <div className="pt-6">
                                    <Button
                                        className={`w-full h-12 text-base font-bold text-white relative overflow-hidden rounded-xl bg-gradient-to-r ${config.gradient} shadow-lg hover:shadow-xl hover:brightness-110 hover:-translate-y-0.5 active:translate-y-0 active:shadow-md transition-all duration-200`}
                                        type="submit"
                                        disabled={loading}
                                    >
                                        <span className="relative flex items-center justify-center gap-2">
                                            {loading ? (
                                                <>
                                                    <Loader2 className="h-5 w-5 animate-spin" />
                                                    Processing...
                                                </>
                                            ) : isSignUp ? (
                                                <>Create Account <ArrowRight className="h-4 w-4" /></>
                                            ) : (
                                                <>Sign In <ArrowRight className="h-4 w-4" /></>
                                            )}
                                        </span>
                                    </Button>
                                </div>
                            </form>

                            <div className="mt-8 text-center">
                                {role === "school" ? (
                                    <p className="text-sm text-muted-foreground">
                                        School admin accounts are created by LearnAI Tutor.
                                        <Link href="/login?role=student" className="ml-2 font-bold text-foreground hover:text-primary transition-colors decoration-2 hover:underline underline-offset-4">Student sign in</Link>
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {isSignUp ? "Already have an account?" : "Don't have an account?"}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsSignUp(!isSignUp);
                                                setError("");
                                            }}
                                            className="ml-2 font-bold text-foreground hover:text-primary transition-colors decoration-2 hover:underline underline-offset-4 focus:outline-none"
                                        >
                                            {isSignUp ? "Sign in" : "Create one"}
                                        </button>
                                    </p>
                                )}
                                {role !== "school" ? (
                                    <p className="mt-3 text-xs text-muted-foreground">
                                        School admin? <Link href="/login?role=school" className="font-semibold text-foreground hover:underline underline-offset-4">Open the school portal</Link>
                                    </p>
                                ) : null}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen flex items-center justify-center p-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            }
        >
            <LoginContent />
        </Suspense>
    );
}

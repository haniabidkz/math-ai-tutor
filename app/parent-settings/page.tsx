"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { ParentProfile } from "@/types/user";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Settings, User2, Mail, Shield, Users, Info
} from "lucide-react";

export default function ParentSettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<ParentProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const handleSignOut = async () => { await signOut(auth); router.push("/"); };

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (cu) => {
            if (!cu) { router.push("/login?role=parent"); return; }
            setUser(cu);
            try {
                const snap = await getDoc(doc(db, "parents", cu.uid));
                if (snap.exists()) setProfile(snap.data() as ParentProfile);
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        });
        return () => unsub();
    }, [router]);

    if (loading) return (
        <div className="min-h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
    );

    return (
        <DashboardLayout
            user={{ name: user?.displayName || "Parent", email: user?.email || "", role: "parent" }}
            onSignOut={handleSignOut}
        >
            <PageHeader
                title="Account Settings"
                description="View your account information and linked children."
                icon={<Settings className="h-6 w-6" />}
            />

            <div className="max-w-2xl space-y-6">
                {/* Profile card */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <User2 className="h-4 w-4" /> Profile
                        </CardTitle>
                        <CardDescription>Your account details as registered in the system.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <Avatar className="h-16 w-16 border-2 border-white shadow">
                                <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xl font-bold">
                                    {(profile?.name || user?.displayName || "P").charAt(0)}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="text-lg font-bold">{profile?.name || user?.displayName || "—"}</p>
                                <Badge variant="secondary" className="mt-1 capitalize">{profile?.role || "parent"}</Badge>
                            </div>
                        </div>

                        <div className="grid gap-3 mt-4">
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border">
                                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Email address</p>
                                    <p className="text-sm font-medium">{profile?.email || user?.email || "—"}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border">
                                <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div>
                                    <p className="text-xs text-muted-foreground">Account type</p>
                                    <p className="text-sm font-medium capitalize">Parent / Guardian</p>
                                </div>
                            </div>

                            {profile?.linkedStudents && profile.linkedStudents.length > 0 && (
                                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/40 border">
                                    <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Linked children</p>
                                        <p className="text-sm font-medium">{profile.linkedStudents.length} child account{profile.linkedStudents.length > 1 ? "s" : ""} linked</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* How linking works */}
                <Card className="border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base text-blue-800 dark:text-blue-300">
                            <Info className="h-4 w-4" /> How Child Linking Works
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ol className="list-decimal pl-5 space-y-2 text-sm text-blue-700 dark:text-blue-400">
                            <li>Ask your child to <strong>Sign Up</strong> as a Student.</li>
                            <li>In the sign-up form, have them enter <strong>{profile?.email || user?.email}</strong> in the "Parent's Email" field.</li>
                            <li>Their progress will automatically appear on your dashboard!</li>
                        </ol>
                    </CardContent>
                </Card>
            </div>
        </DashboardLayout>
    );
}

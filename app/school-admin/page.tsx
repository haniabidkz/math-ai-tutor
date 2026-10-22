"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
    ArrowUpRight, BarChart3, Building2, GraduationCap, LayoutDashboard, LogOut, RefreshCw, School, Settings, ShieldCheck, Users,
} from "lucide-react";
import { PlanBadge } from "@/components/school/plan-badge";
import { PromotionPanel } from "@/components/school/promotion-panel";
import { ReportPanel } from "@/components/school/report-panel";
import { formatDate, jsonInit, schoolApi } from "@/components/school/school-api";
import { SectionManager } from "@/components/school/section-manager";
import { StudentManager } from "@/components/school/student-manager";
import { TeacherManager } from "@/components/school/teacher-manager";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/lib/firebase";
import { formatPhone } from "@/lib/phone";
import type { School as SchoolRecord, SchoolAdminRow, SchoolSection } from "@/types/school";

interface Overview {
    school: SchoolRecord;
    students: { total: number; active: number; graduated: number; premium: number; free: number; paid: number; diagnosticCompleted: number; activeToday: number; active7d: number };
    teachers: number;
    sections: SchoolSection[];
    admins: SchoolAdminRow[];
    viewer: { role: string; name: string };
}

function SchoolAdminContent() {
    const router = useRouter();
    const params = useSearchParams();
    // The super admin opens a school's panel by its id; a school admin always lands on their own.
    const requestedSchool = params.get("schoolId");
    const [ready, setReady] = useState(false);
    const [superAdmin, setSuperAdmin] = useState(false);
    const [overview, setOverview] = useState<Overview | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [contact, setContact] = useState({ name: "", city: "", contactName: "", contactPhone: "", contactEmail: "" });
    const [saving, setSaving] = useState(false);

    const schoolId = superAdmin ? requestedSchool : null;

    const load = useCallback(async () => {
        setError("");
        try {
            const data = await schoolApi<Overview>("/api/school/overview", undefined, superAdmin ? requestedSchool : null);
            setOverview(data);
            setContact({ name: data.school.name, city: data.school.city, contactName: data.school.contactName, contactPhone: data.school.contactPhone ? formatPhone(data.school.contactPhone) : "", contactEmail: data.school.contactEmail });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The school could not be loaded");
        }
    }, [superAdmin, requestedSchool]);

    useEffect(() => onAuthStateChanged(auth, async (user) => {
        if (!user) return router.replace("/login?role=school");
        const token = await user.getIdTokenResult(true);
        const isSuper = token.claims.super_admin === true;
        if (!isSuper && token.claims.role !== "school_admin") {
            setError("This account is not a school admin. Sign in with your school admin account.");
            setReady(true);
            return;
        }
        if (isSuper && !requestedSchool) {
            setError("Open a school from the Super Admin Schools tab.");
            setReady(true);
            return;
        }
        setSuperAdmin(isSuper);
        setReady(true);
    }), [router, requestedSchool]);

    useEffect(() => { if (ready && !error) void load(); }, [ready, error, load]);

    function say(message: string) {
        setNotice(message);
        window.setTimeout(() => setNotice(""), 5000);
    }

    async function saveContact(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        try {
            await schoolApi("/api/school/overview", jsonInit("PATCH", contact), schoolId);
            say("School details saved.");
            await load();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The details could not be saved");
        } finally {
            setSaving(false);
        }
    }

    if (!ready) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
    if (error && !overview) {
        return (
            <main className="mx-auto max-w-xl p-8">
                <Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertTitle>School panel</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>
                <div className="mt-4 flex gap-2">
                    <Button variant="outline" asChild><Link href="/login?role=school">Sign in</Link></Button>
                    <Button variant="ghost" onClick={() => signOut(auth).then(() => router.replace("/login?role=school"))}>Sign out</Button>
                </div>
            </main>
        );
    }
    if (!overview) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading your school…</div>;

    const { school, students } = overview;
    const seatPercent = school.seatLimit ? Math.min(100, Math.round((school.seatsUsed / school.seatLimit) * 100)) : 0;
    const planNote = school.effectivePlan === "paid"
        ? "Your school is on the paid plan: every lesson is open to every student."
        : school.effectivePlan === "trial"
            ? `Your free trial ends on ${formatDate(school.trialEndsAt)}. Students can use the free chapters; the rest opens with the paid plan.`
            : "Your trial has ended. The panels keep working and students keep the free chapters; contact LearnAI Tutor to upgrade.";

    return (
        <div className="min-h-screen bg-slate-100">
            <header className="sticky top-0 z-30 border-b bg-slate-950 text-white">
                <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <Building2 className="h-6 w-6 text-sky-400" />
                        <div>
                            <h1 className="font-semibold">{school.name}</h1>
                            <p className="text-xs text-slate-400">School code <span className="font-mono">{school.code}</span> · {overview.viewer.name}{superAdmin ? " (super admin view)" : ""}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <PlanBadge plan={school.effectivePlan} trialDaysLeft={school.trialDaysLeft} status={school.status} />
                        <Button variant="outline" size="sm" className="border-slate-700 bg-transparent text-white" onClick={() => load()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                        {superAdmin ? <Button variant="ghost" size="sm" asChild><Link href="/super-admin">Back to Super Admin</Link></Button> : null}
                        <Button variant="ghost" size="icon" title="Sign out" onClick={() => signOut(auth).then(() => router.replace("/login?role=school"))}><LogOut className="h-4 w-4" /></Button>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-[1400px] p-4 md:p-6">
                {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
                {notice ? <Alert className="mb-4 border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}

                <Tabs defaultValue="overview">
                    <TabsList className="mb-4 h-auto w-full justify-start overflow-x-auto rounded-md bg-white p-1">
                        <TabsTrigger value="overview"><LayoutDashboard className="mr-2 h-4 w-4" />Overview</TabsTrigger>
                        <TabsTrigger value="students"><GraduationCap className="mr-2 h-4 w-4" />Students</TabsTrigger>
                        <TabsTrigger value="teachers"><Users className="mr-2 h-4 w-4" />Teachers</TabsTrigger>
                        <TabsTrigger value="sections"><School className="mr-2 h-4 w-4" />Classes &amp; Sections</TabsTrigger>
                        <TabsTrigger value="promotion"><ArrowUpRight className="mr-2 h-4 w-4" />Promotion</TabsTrigger>
                        <TabsTrigger value="reports"><BarChart3 className="mr-2 h-4 w-4" />Reports</TabsTrigger>
                        <TabsTrigger value="settings"><Settings className="mr-2 h-4 w-4" />Settings</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-4">
                        <Alert className={school.effectivePlan === "expired" ? "border-amber-300 bg-amber-50" : "border-sky-200 bg-sky-50"}>
                            <AlertTitle>{school.effectivePlan === "paid" ? "Paid plan" : school.effectivePlan === "trial" ? `Free trial · ${school.trialDaysLeft} ${school.trialDaysLeft === 1 ? "day" : "days"} left` : "Trial ended"}</AlertTitle>
                            <AlertDescription>{planNote}</AlertDescription>
                        </Alert>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                                { label: "Students", value: students.active, note: students.graduated ? `${students.graduated} graduated` : "current students" },
                                { label: "Teachers", value: overview.teachers, note: `${overview.sections.length} sections` },
                                { label: "Paid plan / Free", value: `${students.premium} / ${students.free}`, note: `${students.paid} paid individually` },
                                { label: "Active this week", value: students.active7d, note: `${students.activeToday} today` },
                            ].map((card) => (
                                <Card key={card.label} className="rounded-md">
                                    <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{card.label}</CardTitle></CardHeader>
                                    <CardContent><p className="text-3xl font-bold">{card.value}</p><p className="text-xs text-muted-foreground">{card.note}</p></CardContent>
                                </Card>
                            ))}
                        </div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-base">Seats</CardTitle><CardDescription>{school.seatsUsed} of {school.seatLimit} seats used. New students cannot join once every seat is taken.</CardDescription></CardHeader>
                                <CardContent><Progress value={seatPercent} className="h-2" aria-label="Seats used" />{seatPercent >= 90 ? <p className="mt-2 text-xs text-amber-700">Nearly full: contact LearnAI Tutor to add seats.</p> : null}</CardContent>
                            </Card>
                            <Card>
                                <CardHeader className="pb-2"><CardTitle className="text-base">How students join</CardTitle></CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    <p>Add them yourself in the Students tab (one by one or by bulk import), or let them sign up on the website with the school code <Badge variant="secondary" className="font-mono">{school.code}</Badge>.</p>
                                    <p className="text-muted-foreground">{students.diagnosticCompleted} of {students.active} students have taken the diagnostic test.</p>
                                </CardContent>
                            </Card>
                        </div>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-base">Sections</CardTitle></CardHeader>
                            <CardContent>
                                {overview.sections.length === 0 ? <p className="text-sm text-muted-foreground">No sections yet: create them in Classes &amp; Sections.</p> : (
                                    <div className="flex flex-wrap gap-2">
                                        {overview.sections.map((section) => <Badge key={section.id} variant={section.active ? "outline" : "secondary"}>{section.label} · {section.students}</Badge>)}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="students"><StudentManager schoolId={schoolId} sections={overview.sections} canManage onChanged={() => load()} /></TabsContent>
                    <TabsContent value="teachers"><TeacherManager schoolId={schoolId} sections={overview.sections} onChanged={() => load()} /></TabsContent>
                    <TabsContent value="sections"><SectionManager schoolId={schoolId} sections={overview.sections} onChanged={() => load()} /></TabsContent>
                    <TabsContent value="promotion"><PromotionPanel schoolId={schoolId} schoolCode={school.code} onDone={() => load()} /></TabsContent>
                    <TabsContent value="reports"><ReportPanel schoolId={schoolId} /></TabsContent>

                    <TabsContent value="settings" className="space-y-4">
                        <Card>
                            <CardHeader><CardTitle className="text-base">School details</CardTitle><CardDescription>The plan, seats and code are managed by LearnAI Tutor; contact them to change those.</CardDescription></CardHeader>
                            <CardContent>
                                <form onSubmit={saveContact} className="grid gap-3 md:grid-cols-2">
                                    <div className="space-y-1"><Label htmlFor="sc-name">School name</Label><Input id="sc-name" required value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} /></div>
                                    <div className="space-y-1"><Label htmlFor="sc-city">City</Label><Input id="sc-city" value={contact.city} onChange={(event) => setContact({ ...contact, city: event.target.value })} /></div>
                                    <div className="space-y-1"><Label htmlFor="sc-contact">Contact person</Label><Input id="sc-contact" value={contact.contactName} onChange={(event) => setContact({ ...contact, contactName: event.target.value })} /></div>
                                    <div className="space-y-1"><Label htmlFor="sc-phone">Contact mobile</Label><Input id="sc-phone" value={contact.contactPhone} onChange={(event) => setContact({ ...contact, contactPhone: event.target.value })} /></div>
                                    <div className="space-y-1"><Label htmlFor="sc-email">Contact email</Label><Input id="sc-email" type="email" value={contact.contactEmail} onChange={(event) => setContact({ ...contact, contactEmail: event.target.value })} /></div>
                                    <div className="md:col-span-2"><Button type="submit" disabled={saving}>Save details</Button></div>
                                </form>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader><CardTitle className="text-base">Plan and admins</CardTitle></CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <p>Plan: <PlanBadge plan={school.effectivePlan} trialDaysLeft={school.trialDaysLeft} status={school.status} />{school.trialEndsAt && school.plan === "trial" ? ` · trial ends ${formatDate(school.trialEndsAt)}` : ""}{school.paidUntil ? ` · paid until ${formatDate(school.paidUntil)}` : ""}</p>
                                <p>Seats: {school.seatsUsed} / {school.seatLimit}</p>
                                <p>School admins: {overview.admins.map((admin) => `${admin.name} (${admin.contact})`).join(", ") || "—"}</p>
                                <p className="text-muted-foreground">Created {formatDate(school.createdAt)}.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}

export default function SchoolAdminPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>}>
            <SchoolAdminContent />
        </Suspense>
    );
}

"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "@/lib/admin-api";
import type { PlatformAnalytics } from "@/lib/analytics-server";

interface SchoolRow { id: string; name: string; code: string; plan: string; seatsUsed: number; seatLimit: number; status: string }

const percent = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

/** Super Admin: daily actives, usage funnel, free versus paid, most failed questions and misconception patterns. */
export function AnalyticsAdmin() {
    const [data, setData] = useState<{ analytics: PlatformAnalytics; schools: SchoolRow[] } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => { void load(); }, []);

    async function load() {
        setLoading(true);
        setError("");
        try { setData(await adminApi("/api/admin/analytics")); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Analytics could not be loaded"); }
        finally { setLoading(false); }
    }

    const analytics = data?.analytics;
    const week = analytics?.windows.find((window) => window.days === 7);
    const month = analytics?.windows.find((window) => window.days === 30);
    const maxDaily = Math.max(1, ...(analytics?.dailyActive.map((day) => day.students) ?? [1]));

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Counted from real use: a student is active on a day when they open the app or answer a question. Numbers start from the day this was switched on.</p>
                <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
            </div>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {analytics ? (
                <>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                            { label: "Active today (DAU)", value: analytics.dauStudents, note: `${analytics.dau} users incl. staff` },
                            { label: "Active last 7 days", value: week?.activeStudents ?? 0, note: `${week?.regularStudents ?? 0} regular (3+ days)` },
                            { label: "Active last 30 days", value: month?.activeStudents ?? 0, note: `${month?.regularStudents ?? 0} regular (3+ days)` },
                            { label: "Students", value: analytics.users.students, note: `${analytics.users.signups7d} new this week · ${analytics.users.signups30d} this month` },
                        ].map((card) => (
                            <Card key={card.label} className="rounded-md"><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{card.label}</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{card.value}</p><p className="text-xs text-muted-foreground">{card.note}</p></CardContent></Card>
                        ))}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />Active students per day</CardTitle><CardDescription>Last 14 days, Pakistan time.</CardDescription></CardHeader>
                            <CardContent>
                                <div className="flex h-36 items-end gap-1">
                                    {analytics.dailyActive.map((day) => (
                                        <div key={day.date} className="flex flex-1 flex-col items-center gap-1" title={`${day.date}: ${day.students} students, ${day.users} users`}>
                                            <span className="text-[10px] text-muted-foreground">{day.students || ""}</span>
                                            <div className="w-full rounded-t bg-indigo-500" style={{ height: `${Math.max(2, (day.students / maxDaily) * 100)}%` }} />
                                            <span className="text-[9px] text-muted-foreground">{day.date.slice(8)}</span>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" />Usage breakdown</CardTitle><CardDescription>Where students are on the journey.</CardDescription></CardHeader>
                            <CardContent>
                                <table className="w-full text-sm">
                                    <tbody className="divide-y">
                                        {[
                                            ["Signed up", analytics.users.students, ""],
                                            ["Completed the diagnostic", analytics.users.diagnosticCompleted, percent(analytics.users.diagnosticCompleted, analytics.users.students)],
                                            ["Diagnostic drop-offs (never finished it)", analytics.users.diagnosticDropOffs, percent(analytics.users.diagnosticDropOffs, analytics.users.students)],
                                            ["Completed at least one lesson", analytics.users.oneLessonCompleters, percent(analytics.users.oneLessonCompleters, analytics.users.students)],
                                            ["Completed at least one quiz", analytics.users.quizCompleters, percent(analytics.users.quizCompleters, analytics.users.students)],
                                            ["Regular (3+ active days in 7)", week?.regularStudents ?? 0, percent(week?.regularStudents ?? 0, analytics.users.students)],
                                            ["Paid plan", analytics.users.paidStudents, percent(analytics.users.paidStudents, analytics.users.students)],
                                            ["Free (trial or free tier)", analytics.users.freeStudents, percent(analytics.users.freeStudents, analytics.users.students)],
                                            ["School students", analytics.users.schoolStudents, percent(analytics.users.schoolStudents, analytics.users.students)],
                                            ["Individual students", analytics.users.individualStudents, percent(analytics.users.individualStudents, analytics.users.students)],
                                        ].map(([label, value, share]) => (
                                            <tr key={String(label)}><td className="py-1.5">{label}</td><td className="py-1.5 text-right font-semibold">{value}</td><td className="w-14 py-1.5 text-right text-xs text-muted-foreground">{share}</td></tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="mt-2 text-xs text-muted-foreground">By class: {Object.entries(analytics.users.byClass).sort().map(([level, count]) => `Class ${level}: ${count}`).join(" · ")}. Teachers {analytics.users.teachers}, parents {analytics.users.parents}, school admins {analytics.users.schoolAdmins}.</p>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-red-500" />Most failed questions</CardTitle><CardDescription>Across every student, since counting began.</CardDescription></CardHeader>
                            <CardContent className="p-0">
                                {analytics.failedQuestions.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No answers counted yet.</p> : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-2">Question</th><th className="p-2">Lesson</th><th className="p-2">Wrong</th><th className="p-2">Rate</th></tr></thead>
                                        <tbody className="divide-y">
                                            {analytics.failedQuestions.map((item) => (
                                                <tr key={item.id}><td className="p-2"><span className="line-clamp-2">{item.question}</span><span className="font-mono text-[10px] text-muted-foreground">{item.id}</span></td><td className="p-2 font-mono text-xs">{item.microTag}</td><td className="p-2">{item.wrong} / {item.attempts}</td><td className="p-2 font-semibold">{item.wrongRate}%</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-base">Top misconception patterns</CardTitle><CardDescription>Which wrong ideas come up most, and in which lessons.</CardDescription></CardHeader>
                            <CardContent className="p-0">
                                {analytics.misconceptions.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No wrong answers counted yet.</p> : (
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-2">Misconception</th><th className="p-2">Count</th><th className="p-2">Top lessons</th></tr></thead>
                                        <tbody className="divide-y">
                                            {analytics.misconceptions.map((item) => (
                                                <tr key={item.tag}><td className="p-2"><strong>{item.label}</strong><p className="font-mono text-[10px] text-muted-foreground">{item.tag}</p></td><td className="p-2 font-semibold">{item.count}</td><td className="p-2 text-xs">{item.topLessons.map((lesson) => `${lesson.microTag} (${lesson.count})`).join(", ")}</td></tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-base">Schools</CardTitle><CardDescription>{analytics.schools.trial} on trial · {analytics.schools.paid} paid · {analytics.schools.expired} expired · {analytics.schools.suspended} suspended</CardDescription></CardHeader>
                        <CardContent className="p-0">
                            {data!.schools.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No schools yet.</p> : (
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-2">School</th><th className="p-2">Code</th><th className="p-2">Plan</th><th className="p-2">Seats</th></tr></thead>
                                    <tbody className="divide-y">
                                        {data!.schools.map((school) => <tr key={school.id}><td className="p-2">{school.name}</td><td className="p-2 font-mono">{school.code}</td><td className="p-2">{school.status === "suspended" ? "suspended" : school.plan}</td><td className="p-2">{school.seatsUsed} / {school.seatLimit}</td></tr>)}
                                    </tbody>
                                </table>
                            )}
                        </CardContent>
                    </Card>
                </>
            ) : loading ? <p className="text-sm text-muted-foreground">Counting…</p> : null}
        </div>
    );
}

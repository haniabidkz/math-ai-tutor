"use client";

import { useEffect, useState } from "react";
import { Download, Printer, RefreshCw } from "lucide-react";
import { downloadCsv, formatDate, formatDateTime, schoolApi } from "@/components/school/school-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhone } from "@/lib/phone";
import type { SchoolStudentRow } from "@/types/school";

interface SectionReport { sectionId: string | null; label: string; classLevel: number; students: number; diagnosticCompleted: number; quizzesCompleted: number; lessonsCompleted: number; averageXp: number; active7d: number; premium: number; paid: number }
interface Report { sections: SectionReport[]; students: SchoolStudentRow[]; school: { name: string; code: string; plan: string }; generatedAt: number }

/** Performance by section with Excel (CSV) export and a print view that saves as PDF. */
export function ReportPanel({ schoolId }: { schoolId?: string | null }) {
    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => { void load(); }, [schoolId]);

    async function load() {
        setLoading(true);
        setError("");
        try { setReport(await schoolApi<Report>("/api/school/report", undefined, schoolId)); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "The report could not be built"); }
        finally { setLoading(false); }
    }

    function exportSections() {
        if (!report) return;
        downloadCsv(`${report.school.code}-sections.csv`, ["Section", "Class", "Students", "Diagnostic done", "Quizzes completed", "Lessons completed", "Average XP", "Active last 7 days", "Paid plan", "Free"],
            report.sections.map((row) => [row.label, row.classLevel, row.students, row.diagnosticCompleted, row.quizzesCompleted, row.lessonsCompleted, row.averageXp, row.active7d, row.premium, row.students - row.premium]));
    }

    function exportStudents() {
        if (!report) return;
        downloadCsv(`${report.school.code}-students.csv`, ["Name", "Phone", "Class", "Section", "Plan", "Diagnostic done", "XP", "Quizzes", "Lessons", "Last active"],
            report.students.map((student) => [student.name, student.phone ? formatPhone(student.phone) : "", student.classLevel, student.sectionLabel ?? "", student.premium ? "Paid" : "Free", student.diagnosticCompleted ? "Yes" : "No", student.xp, student.quizzesCompleted, student.lessonsCompleted, formatDate(student.lastActiveAt)]));
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 print:hidden">
                <Button size="sm" variant="outline" onClick={exportSections} disabled={!report}><Download className="mr-1 h-4 w-4" />Sections (Excel)</Button>
                <Button size="sm" variant="outline" onClick={exportStudents} disabled={!report}><Download className="mr-1 h-4 w-4" />Students (Excel)</Button>
                <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!report}><Printer className="mr-1 h-4 w-4" />Print / Save as PDF</Button>
                <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
            </div>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {report ? (
                <div className="space-y-4 print:text-black">
                    <div className="hidden print:block">
                        <h1 className="text-xl font-bold">{report.school.name} · performance report</h1>
                        <p className="text-sm">Generated {formatDateTime(report.generatedAt)} · code {report.school.code}</p>
                    </div>
                    <Card>
                        <CardHeader><CardTitle className="text-base">By section</CardTitle><CardDescription>Diagnostic completion, quizzes, lessons and activity for each class and section.</CardDescription></CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-auto">
                                <table className="w-full min-w-[780px] text-left text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">Section</th><th className="p-3">Students</th><th className="p-3">Diagnostic done</th><th className="p-3">Quizzes</th><th className="p-3">Lessons</th><th className="p-3">Avg XP</th><th className="p-3">Active 7d</th><th className="p-3">Paid / Free</th></tr></thead>
                                    <tbody className="divide-y">
                                        {report.sections.length === 0 ? <tr><td colSpan={8} className="p-3 text-muted-foreground">No students yet.</td></tr> : null}
                                        {report.sections.map((row) => (
                                            <tr key={row.label}>
                                                <td className="p-3 font-semibold">{row.label}</td><td className="p-3">{row.students}</td>
                                                <td className="p-3">{row.diagnosticCompleted} ({row.students ? Math.round((row.diagnosticCompleted / row.students) * 100) : 0}%)</td>
                                                <td className="p-3">{row.quizzesCompleted}</td><td className="p-3">{row.lessonsCompleted}</td><td className="p-3">{row.averageXp}</td><td className="p-3">{row.active7d}</td>
                                                <td className="p-3">{row.premium} / {row.students - row.premium}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="text-base">Every student</CardTitle></CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-auto">
                                <table className="w-full min-w-[780px] text-left text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Plan</th><th className="p-3">Diagnostic</th><th className="p-3">XP</th><th className="p-3">Quizzes</th><th className="p-3">Lessons</th><th className="p-3">Last active</th></tr></thead>
                                    <tbody className="divide-y">
                                        {report.students.map((student) => (
                                            <tr key={student.uid}>
                                                <td className="p-3"><strong>{student.name}</strong><p className="text-xs text-muted-foreground">{student.contact}</p></td>
                                                <td className="p-3">{student.sectionLabel ?? `Class ${student.classLevel}`}</td><td className="p-3">{student.premium ? "Paid" : "Free"}</td>
                                                <td className="p-3">{student.diagnosticCompleted ? "Done" : "Not yet"}</td><td className="p-3">{student.xp}</td><td className="p-3">{student.quizzesCompleted}</td><td className="p-3">{student.lessonsCompleted}</td><td className="p-3">{formatDate(student.lastActiveAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ) : loading ? <p className="text-sm text-muted-foreground">Building the report…</p> : null}
        </div>
    );
}

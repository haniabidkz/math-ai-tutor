"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, KeyRound, Loader2, Pencil, Plus, RefreshCw, Search, UserMinus, UserX } from "lucide-react";
import { AccessBadge } from "@/components/school/plan-badge";
import { downloadCsv, formatDate, jsonInit, schoolApi, prettyPhone } from "@/components/school/school-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhone } from "@/lib/phone";
import { SUPPORTED_SCHOOL_CLASSES } from "@/lib/schools";
import type { ImportOutcome, SchoolSection, SchoolStudentRow } from "@/types/school";

interface ImportPreviewRow { line: number; name: string; phone: string; classLevel: number; section: string | null; error: string | null }

const EMPTY_FORM = { name: "", phone: "", email: "", password: "", classLevel: "6", sectionId: "", parentPhone: "", parentEmail: "" };

/**
 * Students of a school: list, search, add one, import many, edit, reset a password, suspend or
 * remove. Teachers get the same screen limited to their sections and without suspend/remove.
 */
export function StudentManager({ schoolId, sections, canManage, onChanged }: {
    schoolId?: string | null;
    sections: SchoolSection[];
    /** False for teachers: they add students and reset passwords only. */
    canManage: boolean;
    onChanged?: () => void;
}) {
    const [students, setStudents] = useState<SchoolStudentRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [search, setSearch] = useState("");
    const [sectionFilter, setSectionFilter] = useState("all");
    const [statusFilter, setStatusFilter] = useState<"active" | "graduated">("active");
    const [mode, setMode] = useState<"list" | "add" | "import">("list");
    const [form, setForm] = useState(EMPTY_FORM);
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState<{ name: string; phone: string; password: string | null } | null>(null);
    const [importText, setImportText] = useState("");
    const [preview, setPreview] = useState<{ rows: ImportPreviewRow[]; valid: number; invalid: number } | null>(null);
    const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);
    const [editing, setEditing] = useState<SchoolStudentRow | null>(null);
    const [editForm, setEditForm] = useState({ name: "", classLevel: "6", sectionId: "", parentPhone: "", parentEmail: "" });

    const headers = schoolId ? { "x-school-id": schoolId } : undefined;
    const api = <T,>(path: string, init?: RequestInit) => schoolApi<T>(path, { ...init, headers: { ...(init?.headers ?? {}), ...(headers ?? {}) } });

    useEffect(() => { void load(); }, [schoolId]);

    async function load() {
        setLoading(true);
        setError("");
        try {
            const data = await api<{ students: SchoolStudentRow[] }>("/api/school/students");
            setStudents(data.students);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Students could not be loaded");
        } finally {
            setLoading(false);
        }
    }

    function say(message: string) {
        setError("");
        setNotice(message);
        window.setTimeout(() => setNotice(""), 6000);
    }

    const fail = (caught: unknown, fallback: string) => { setNotice(""); setError(caught instanceof Error ? caught.message : fallback); };

    const visible = useMemo(() => students.filter((student) => {
        if (student.schoolStatus !== statusFilter) return false;
        if (sectionFilter === "none" && student.sectionId) return false;
        if (sectionFilter !== "all" && sectionFilter !== "none" && student.sectionId !== sectionFilter) return false;
        const text = `${student.name} ${student.contact} ${student.phone ?? ""} ${student.sectionLabel ?? ""}`.toLowerCase();
        return text.includes(search.trim().toLowerCase());
    }), [students, statusFilter, sectionFilter, search]);

    const sectionsForClass = (classLevel: string) => sections.filter((section) => section.active && String(section.classLevel) === classLevel);

    async function addStudent(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setCreated(null);
        try {
            const data = await api<{ password: string | null }>("/api/school/students", jsonInit("POST", {
                ...form, classLevel: Number(form.classLevel), sectionId: form.sectionId || undefined, password: form.password || undefined,
                email: form.email || undefined, parentPhone: form.parentPhone || undefined, parentEmail: form.parentEmail || undefined,
            }));
            setCreated({ name: form.name, phone: form.phone, password: data.password ?? form.password });
            setForm({ ...EMPTY_FORM, classLevel: form.classLevel, sectionId: form.sectionId });
            say(`${form.name} was added.`);
            await load();
            onChanged?.();
        } catch (caught) { fail(caught, "The student could not be added"); }
        finally { setBusy(false); }
    }

    async function previewImport() {
        setBusy(true);
        setOutcomes(null);
        try {
            setPreview(await api("/api/school/students/import", jsonInit("POST", { text: importText, preview: true })));
        } catch (caught) { fail(caught, "The rows could not be read"); }
        finally { setBusy(false); }
    }

    async function runImport() {
        if (!preview || !window.confirm(`Create ${preview.valid} student account${preview.valid === 1 ? "" : "s"} now?`)) return;
        setBusy(true);
        try {
            const data = await api<{ outcomes: ImportOutcome[]; created: number; failed: number }>("/api/school/students/import", jsonInit("POST", { text: importText }));
            setOutcomes(data.outcomes);
            setPreview(null);
            say(`${data.created} created, ${data.failed} failed.`);
            await load();
            onChanged?.();
        } catch (caught) { fail(caught, "The import failed"); }
        finally { setBusy(false); }
    }

    function startEdit(student: SchoolStudentRow) {
        setEditing(student);
        setEditForm({ name: student.name, classLevel: String(student.classLevel), sectionId: student.sectionId ?? "", parentPhone: student.parentPhone ? formatPhone(student.parentPhone) : "", parentEmail: student.parentEmail ?? "" });
    }

    async function saveEdit(event: React.FormEvent) {
        event.preventDefault();
        if (!editing) return;
        setBusy(true);
        try {
            await api("/api/school/students", jsonInit("PATCH", {
                uid: editing.uid, name: editForm.name, classLevel: Number(editForm.classLevel), sectionId: editForm.sectionId || null,
                parentPhone: editForm.parentPhone || undefined, parentEmail: editForm.parentEmail || undefined,
            }));
            setEditing(null);
            say("Student updated.");
            await load();
            onChanged?.();
        } catch (caught) { fail(caught, "The student could not be updated"); }
        finally { setBusy(false); }
    }

    async function act(student: SchoolStudentRow, action: "suspend" | "unsuspend" | "resetPassword" | "remove") {
        const prompts: Record<typeof action, string> = {
            suspend: `Suspend ${student.name}? They will not be able to sign in.`,
            unsuspend: `Let ${student.name} sign in again?`,
            resetPassword: `Give ${student.name} a new password? The old one stops working.`,
            remove: `Remove ${student.name} from the school? Their account and progress stay, as an individual student, and the seat is freed.`,
        };
        if (!window.confirm(prompts[action])) return;
        try {
            const data = await api<{ password: string | null }>("/api/school/students", jsonInit("PATCH", { uid: student.uid, action }));
            if (action === "resetPassword") setCreated({ name: student.name, phone: student.phone ?? "", password: data.password });
            say(action === "resetPassword" ? "Password reset. Share the new one below." : "Done.");
            await load();
            onChanged?.();
        } catch (caught) { fail(caught, "The action failed"); }
    }

    function exportList() {
        downloadCsv("students.csv", ["Name", "Phone", "Email", "Class", "Section", "Plan", "Diagnostic done", "XP", "Quizzes", "Lessons", "Last active", "Parent phone", "Parent email"],
            visible.map((student) => [student.name, student.phone ? formatPhone(student.phone) : "", student.email, student.classLevel, student.sectionLabel ?? "", student.premium ? "Paid" : "Free", student.diagnosticCompleted ? "Yes" : "No", student.xp, student.quizzesCompleted, student.lessonsCompleted, formatDate(student.lastActiveAt), student.parentPhone ? formatPhone(student.parentPhone) : "", student.parentEmail ?? ""]));
    }

    function exportOutcomes() {
        if (!outcomes) return;
        downloadCsv("new-student-logins.csv", ["Line", "Name", "Phone", "Class", "Section", "Password", "Status", "Error"],
            outcomes.map((item) => [item.line, item.name, formatPhone(item.phone), item.classLevel, item.sectionLabel ?? "", item.password ?? "", item.status, item.error ?? ""]));
    }

    const graduated = students.filter((student) => student.schoolStatus === "graduated").length;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={mode === "list" ? "default" : "outline"} onClick={() => setMode("list")}>Students ({students.length - graduated})</Button>
                <Button size="sm" variant={mode === "add" ? "default" : "outline"} onClick={() => setMode("add")}><Plus className="mr-1 h-4 w-4" />Add student</Button>
                <Button size="sm" variant={mode === "import" ? "default" : "outline"} onClick={() => setMode("import")}><FileSpreadsheet className="mr-1 h-4 w-4" />Bulk import</Button>
                <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
                <Button size="sm" variant="ghost" onClick={exportList} disabled={!visible.length}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
            </div>

            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {notice ? <Alert className="border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}
            {created ? (
                <Alert className="border-indigo-300 bg-indigo-50">
                    <KeyRound className="h-4 w-4" />
                    <AlertDescription>
                        <strong>{created.name}</strong> signs in with phone <strong>{prettyPhone(created.phone)}</strong>
                        {created.password ? <> and password <code className="rounded bg-white px-1.5 py-0.5 font-mono">{created.password}</code>. Write it down now; it is not shown again.</> : <> and the password you typed.</>}
                    </AlertDescription>
                </Alert>
            ) : null}

            {mode === "add" ? (
                <Card>
                    <CardHeader><CardTitle className="text-base">Add one student</CardTitle><CardDescription>The student signs in with this phone number and password. Leave the password blank to get one made up.</CardDescription></CardHeader>
                    <CardContent>
                        <form onSubmit={addStudent} className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1"><Label htmlFor="st-name">Full name</Label><Input id="st-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
                            <div className="space-y-1"><Label htmlFor="st-phone">Mobile number</Label><Input id="st-phone" required placeholder="03001234567" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
                            <div className="space-y-1">
                                <Label htmlFor="st-class">Class</Label>
                                <select id="st-class" className="h-9 w-full rounded-md border px-2 text-sm" value={form.classLevel} onChange={(event) => setForm({ ...form, classLevel: event.target.value, sectionId: "" })}>
                                    {SUPPORTED_SCHOOL_CLASSES.map((level) => <option key={level} value={level}>Class {level}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="st-section">Section</Label>
                                <select id="st-section" className="h-9 w-full rounded-md border px-2 text-sm" value={form.sectionId} onChange={(event) => setForm({ ...form, sectionId: event.target.value })}>
                                    <option value="">No section yet</option>
                                    {sectionsForClass(form.classLevel).map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1"><Label htmlFor="st-password">Password <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="st-password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div>
                            <div className="space-y-1"><Label htmlFor="st-email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="st-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
                            <div className="space-y-1"><Label htmlFor="st-parent-phone">Parent mobile <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="st-parent-phone" value={form.parentPhone} onChange={(event) => setForm({ ...form, parentPhone: event.target.value })} /></div>
                            <div className="space-y-1"><Label htmlFor="st-parent-email">Parent email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="st-parent-email" type="email" value={form.parentEmail} onChange={(event) => setForm({ ...form, parentEmail: event.target.value })} /></div>
                            <div className="md:col-span-2"><Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add student</Button></div>
                        </form>
                    </CardContent>
                </Card>
            ) : null}

            {mode === "import" ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Bulk import</CardTitle>
                        <CardDescription>Paste rows from Excel or type them: <code>Name, Phone, Class, Section, Password, Parent phone</code> — one student per line. Section and password are optional; a missing section is created, a missing password is made up.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <textarea className="min-h-40 w-full rounded-md border p-2 font-mono text-sm" placeholder={"Ali Ahmed, 03001234567, 6, A\nSara Malik, 03001234568, 6, A, Sara2026"} value={importText} onChange={(event) => { setImportText(event.target.value); setPreview(null); }} />
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={previewImport} disabled={busy || !importText.trim()}>Check rows</Button>
                            <Button onClick={runImport} disabled={busy || !preview || preview.valid === 0}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Create {preview?.valid ?? 0} accounts</Button>
                            {outcomes ? <Button variant="ghost" onClick={exportOutcomes}><Download className="mr-1 h-4 w-4" />Download logins</Button> : null}
                        </div>
                        {preview ? (
                            <div className="overflow-auto rounded-md border">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100"><tr><th className="p-2">Line</th><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">Class</th><th className="p-2">Section</th><th className="p-2">Check</th></tr></thead>
                                    <tbody className="divide-y">
                                        {preview.rows.map((row) => (
                                            <tr key={row.line} className={row.error ? "bg-red-50" : ""}>
                                                <td className="p-2">{row.line}</td><td className="p-2">{row.name}</td><td className="p-2">{row.phone ? formatPhone(row.phone) : "—"}</td><td className="p-2">{row.classLevel || "—"}</td><td className="p-2">{row.section ?? "—"}</td>
                                                <td className="p-2">{row.error ? <span className="text-red-700">{row.error}</span> : <span className="text-emerald-700">OK</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                        {outcomes ? (
                            <div className="overflow-auto rounded-md border">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-slate-100"><tr><th className="p-2">Line</th><th className="p-2">Name</th><th className="p-2">Phone</th><th className="p-2">Section</th><th className="p-2">Password</th><th className="p-2">Result</th></tr></thead>
                                    <tbody className="divide-y">
                                        {outcomes.map((item) => (
                                            <tr key={item.line} className={item.status === "failed" ? "bg-red-50" : ""}>
                                                <td className="p-2">{item.line}</td><td className="p-2">{item.name}</td><td className="p-2">{formatPhone(item.phone)}</td><td className="p-2">{item.sectionLabel ?? "—"}</td>
                                                <td className="p-2 font-mono">{item.password ?? (item.status === "created" ? "(as typed)" : "")}</td>
                                                <td className="p-2">{item.status === "created" ? <span className="text-emerald-700">Created</span> : <span className="text-red-700">{item.error}</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            ) : null}

            {mode === "list" ? (
                <Card>
                    <CardContent className="p-0">
                        <div className="flex flex-wrap items-center gap-2 border-b p-3">
                            <div className="relative flex-1 min-w-48">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input className="pl-9" placeholder="Search name, phone, section" value={search} onChange={(event) => setSearch(event.target.value)} />
                            </div>
                            <select className="h-9 rounded-md border px-2 text-sm" value={sectionFilter} onChange={(event) => setSectionFilter(event.target.value)}>
                                <option value="all">All sections</option>
                                <option value="none">No section</option>
                                {sections.map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                            </select>
                            {graduated ? (
                                <select className="h-9 rounded-md border px-2 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "active" | "graduated")}>
                                    <option value="active">Current students</option>
                                    <option value="graduated">Graduated ({graduated})</option>
                                </select>
                            ) : null}
                            <span className="text-xs text-muted-foreground">{visible.length} shown</span>
                        </div>
                        {loading ? <p className="p-6 text-sm text-muted-foreground">Loading students…</p> : visible.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No students here yet. Use Add student or Bulk import.</p> : (
                            <div className="overflow-auto">
                                <table className="w-full min-w-[900px] text-left text-sm">
                                    <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">Student</th><th className="p-3">Class</th><th className="p-3">Plan</th><th className="p-3">Diagnostic</th><th className="p-3">XP</th><th className="p-3">Last active</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
                                    <tbody className="divide-y">
                                        {visible.map((student) => (
                                            <tr key={student.uid} className={student.disabled ? "bg-slate-50 text-muted-foreground" : ""}>
                                                <td className="p-3"><strong>{student.name}</strong><p className="text-xs text-muted-foreground">{student.contact}{student.parentPhone ? ` · parent ${formatPhone(student.parentPhone)}` : ""}</p></td>
                                                <td className="p-3">{student.sectionLabel ?? `Class ${student.classLevel}`}</td>
                                                <td className="p-3"><AccessBadge premium={student.premium} /></td>
                                                <td className="p-3">{student.diagnosticCompleted ? <Badge variant="secondary">Done</Badge> : <Badge variant="outline">Not yet</Badge>}</td>
                                                <td className="p-3">{student.xp}</td>
                                                <td className="p-3">{formatDate(student.lastActiveAt)}</td>
                                                <td className="p-3">{student.disabled ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>}</td>
                                                <td className="p-3">
                                                    <div className="flex flex-wrap gap-1">
                                                        <Button size="sm" variant="ghost" title="Edit" onClick={() => startEdit(student)}><Pencil className="h-4 w-4" /></Button>
                                                        <Button size="sm" variant="ghost" title="Reset password" onClick={() => act(student, "resetPassword")}><KeyRound className="h-4 w-4" /></Button>
                                                        {canManage ? <Button size="sm" variant="ghost" title={student.disabled ? "Allow sign-in" : "Suspend"} onClick={() => act(student, student.disabled ? "unsuspend" : "suspend")}><UserX className={`h-4 w-4 ${student.disabled ? "text-emerald-600" : "text-amber-600"}`} /></Button> : null}
                                                        {canManage ? <Button size="sm" variant="ghost" title="Remove from school" onClick={() => act(student, "remove")}><UserMinus className="h-4 w-4 text-red-600" /></Button> : null}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            ) : null}

            {editing ? (
                <Card className="border-indigo-200">
                    <CardHeader><CardTitle className="text-base">Edit {editing.name}</CardTitle></CardHeader>
                    <CardContent>
                        <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1"><Label htmlFor="ed-name">Full name</Label><Input id="ed-name" required value={editForm.name} onChange={(event) => setEditForm({ ...editForm, name: event.target.value })} /></div>
                            <div className="space-y-1">
                                <Label htmlFor="ed-class">Class</Label>
                                <select id="ed-class" className="h-9 w-full rounded-md border px-2 text-sm" value={editForm.classLevel} onChange={(event) => setEditForm({ ...editForm, classLevel: event.target.value, sectionId: "" })}>
                                    {SUPPORTED_SCHOOL_CLASSES.map((level) => <option key={level} value={level}>Class {level}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="ed-section">Section</Label>
                                <select id="ed-section" className="h-9 w-full rounded-md border px-2 text-sm" value={editForm.sectionId} onChange={(event) => setEditForm({ ...editForm, sectionId: event.target.value })}>
                                    <option value="">No section</option>
                                    {sectionsForClass(editForm.classLevel).map((section) => <option key={section.id} value={section.id}>{section.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1"><Label htmlFor="ed-parent-phone">Parent mobile</Label><Input id="ed-parent-phone" value={editForm.parentPhone} onChange={(event) => setEditForm({ ...editForm, parentPhone: event.target.value })} /></div>
                            <div className="space-y-1"><Label htmlFor="ed-parent-email">Parent email</Label><Input id="ed-parent-email" type="email" value={editForm.parentEmail} onChange={(event) => setEditForm({ ...editForm, parentEmail: event.target.value })} /></div>
                            <div className="flex gap-2 md:col-span-2">
                                <Button type="submit" disabled={busy}>Save</Button>
                                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}

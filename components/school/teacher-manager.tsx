"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, RefreshCw, UserMinus, UserX } from "lucide-react";
import { jsonInit, schoolApi, prettyPhone } from "@/components/school/school-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhone } from "@/lib/phone";
import type { SchoolSection, SchoolTeacherRow } from "@/types/school";

const EMPTY = { name: "", phone: "", email: "", password: "" };

/** Teachers of a school: add with a phone sign-in, tick their sections, reset, suspend, remove. */
export function TeacherManager({ schoolId, sections, onChanged }: { schoolId?: string | null; sections: SchoolSection[]; onChanged?: () => void }) {
    const [teachers, setTeachers] = useState<SchoolTeacherRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState(EMPTY);
    const [formSections, setFormSections] = useState<string[]>([]);
    const [busy, setBusy] = useState(false);
    const [created, setCreated] = useState<{ name: string; phone: string; password: string | null } | null>(null);

    const api = <T,>(path: string, init?: RequestInit) => schoolApi<T>(path, init, schoolId);

    useEffect(() => { void load(); }, [schoolId]);

    async function load() {
        setLoading(true);
        setError("");
        try {
            setTeachers((await api<{ teachers: SchoolTeacherRow[] }>("/api/school/teachers")).teachers);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Teachers could not be loaded"); }
        finally { setLoading(false); }
    }

    const say = (message: string) => { setError(""); setNotice(message); window.setTimeout(() => setNotice(""), 6000); };
    const fail = (caught: unknown, fallback: string) => { setNotice(""); setError(caught instanceof Error ? caught.message : fallback); };

    async function add(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        setCreated(null);
        try {
            const data = await api<{ password: string | null }>("/api/school/teachers", jsonInit("POST", { ...form, email: form.email || undefined, password: form.password || undefined, sectionIds: formSections }));
            setCreated({ name: form.name, phone: form.phone, password: data.password ?? form.password });
            setForm(EMPTY);
            setFormSections([]);
            setAdding(false);
            say(`${form.name} was added.`);
            await load();
            onChanged?.();
        } catch (caught) { fail(caught, "The teacher could not be added"); }
        finally { setBusy(false); }
    }

    async function toggleSection(teacher: SchoolTeacherRow, sectionId: string) {
        const next = teacher.assignedSectionIds.includes(sectionId) ? teacher.assignedSectionIds.filter((id) => id !== sectionId) : [...teacher.assignedSectionIds, sectionId];
        try {
            await api("/api/school/teachers", jsonInit("PATCH", { uid: teacher.uid, sectionIds: next }));
            setTeachers((current) => current.map((item) => (item.uid === teacher.uid ? { ...item, assignedSectionIds: next, assignedClasses: [...new Set(sections.filter((section) => next.includes(section.id)).map((section) => section.classLevel))] } : item)));
        } catch (caught) { fail(caught, "The sections could not be saved"); }
    }

    async function act(teacher: SchoolTeacherRow, action: "suspend" | "unsuspend" | "resetPassword" | "remove") {
        const prompts: Record<typeof action, string> = {
            suspend: `Suspend ${teacher.name}? They will not be able to sign in.`,
            unsuspend: `Let ${teacher.name} sign in again?`,
            resetPassword: `Give ${teacher.name} a new password?`,
            remove: `Remove ${teacher.name} from the school? Their account is deactivated so they no longer see your students.`,
        };
        if (!window.confirm(prompts[action])) return;
        try {
            const data = await api<{ password: string | null }>("/api/school/teachers", jsonInit("PATCH", { uid: teacher.uid, action }));
            if (action === "resetPassword") setCreated({ name: teacher.name, phone: teacher.phone ?? "", password: data.password });
            say("Done.");
            await load();
            onChanged?.();
        } catch (caught) { fail(caught, "The action failed"); }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => setAdding((open) => !open)}><Plus className="mr-1 h-4 w-4" />Add teacher</Button>
                <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
                <span className="text-xs text-muted-foreground">{teachers.length} teacher{teachers.length === 1 ? "" : "s"}</span>
            </div>
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {notice ? <Alert className="border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}
            {created ? (
                <Alert className="border-indigo-300 bg-indigo-50">
                    <KeyRound className="h-4 w-4" />
                    <AlertDescription><strong>{created.name}</strong> signs in with phone <strong>{prettyPhone(created.phone)}</strong>{created.password ? <> and password <code className="rounded bg-white px-1.5 py-0.5 font-mono">{created.password}</code>. Write it down now.</> : <> and the password you typed.</>}</AlertDescription>
                </Alert>
            ) : null}

            {adding ? (
                <Card>
                    <CardHeader><CardTitle className="text-base">New teacher</CardTitle><CardDescription>Tick the sections this teacher looks after. A teacher with no sections sees the whole school.</CardDescription></CardHeader>
                    <CardContent>
                        <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1"><Label htmlFor="te-name">Full name</Label><Input id="te-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
                            <div className="space-y-1"><Label htmlFor="te-phone">Mobile number</Label><Input id="te-phone" required placeholder="03001234567" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
                            <div className="space-y-1"><Label htmlFor="te-email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="te-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></div>
                            <div className="space-y-1"><Label htmlFor="te-password">Password <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="te-password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></div>
                            <div className="md:col-span-2">
                                <Label>Sections</Label>
                                <div className="mt-1 flex flex-wrap gap-3">
                                    {sections.filter((section) => section.active).map((section) => (
                                        <label key={section.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={formSections.includes(section.id)} onChange={(event) => setFormSections((current) => event.target.checked ? [...current, section.id] : current.filter((id) => id !== section.id))} />{section.label}</label>
                                    ))}
                                    {!sections.length ? <span className="text-xs text-muted-foreground">Create sections first (Classes tab).</span> : null}
                                </div>
                            </div>
                            <div className="flex gap-2 md:col-span-2">
                                <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add teacher</Button>
                                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : null}

            <Card>
                <CardContent className="p-0">
                    {loading ? <p className="p-6 text-sm text-muted-foreground">Loading teachers…</p> : teachers.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No teachers yet.</p> : (
                        <div className="overflow-auto">
                            <table className="w-full min-w-[760px] text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">Teacher</th><th className="p-3">Sections</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
                                <tbody className="divide-y">
                                    {teachers.map((teacher) => (
                                        <tr key={teacher.uid} className={teacher.disabled ? "bg-slate-50 text-muted-foreground" : ""}>
                                            <td className="p-3"><strong>{teacher.name}</strong><p className="text-xs text-muted-foreground">{teacher.contact}</p></td>
                                            <td className="p-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {sections.filter((section) => section.active).map((section) => (
                                                        <label key={section.id} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={teacher.assignedSectionIds.includes(section.id)} onChange={() => toggleSection(teacher, section.id)} />{section.label}</label>
                                                    ))}
                                                    {!teacher.assignedSectionIds.length ? <Badge variant="outline" className="text-[10px]">Whole school</Badge> : null}
                                                </div>
                                            </td>
                                            <td className="p-3">{teacher.disabled ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>}</td>
                                            <td className="p-3">
                                                <div className="flex gap-1">
                                                    <Button size="sm" variant="ghost" title="Reset password" onClick={() => act(teacher, "resetPassword")}><KeyRound className="h-4 w-4" /></Button>
                                                    <Button size="sm" variant="ghost" title={teacher.disabled ? "Allow sign-in" : "Suspend"} onClick={() => act(teacher, teacher.disabled ? "unsuspend" : "suspend")}><UserX className={`h-4 w-4 ${teacher.disabled ? "text-emerald-600" : "text-amber-600"}`} /></Button>
                                                    <Button size="sm" variant="ghost" title="Remove from school" onClick={() => act(teacher, "remove")}><UserMinus className="h-4 w-4 text-red-600" /></Button>
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
        </div>
    );
}

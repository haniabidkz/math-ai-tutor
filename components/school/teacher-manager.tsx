"use client";

import { useEffect, useState } from "react";
import { KeyRound, Loader2, Pencil, Plus, RefreshCw, UserMinus, UserX } from "lucide-react";
import { jsonInit, prettyPhone, schoolApi } from "@/components/school/school-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPhone } from "@/lib/phone";
import { SUPPORTED_SCHOOL_CLASSES } from "@/lib/schools";
import type { SchoolSection, SchoolTeacherRow } from "@/types/school";

interface TeacherForm { name: string; phone: string; email: string; password: string; classes: number[]; sectionIds: string[] }
const EMPTY: TeacherForm = { name: "", phone: "", email: "", password: "", classes: [], sectionIds: [] };

/** "Class 7", "6-A"… or "Whole school" when nothing is ticked. */
function scopeChips(teacher: SchoolTeacherRow, sections: SchoolSection[]) {
    const chips = [
        ...teacher.assignedClassLevels.map((level) => `Class ${level} (all)`),
        ...teacher.assignedSectionIds.map((id) => sections.find((section) => section.id === id)?.label ?? "?"),
    ];
    return chips.length ? chips : ["Whole school"];
}

/** The classes and sections a teacher looks after, as checkboxes. */
function ScopePicker({ value, sections, onChange }: { value: Pick<TeacherForm, "classes" | "sectionIds">; sections: SchoolSection[]; onChange: (next: Pick<TeacherForm, "classes" | "sectionIds">) => void }) {
    const toggleClass = (level: number) => onChange({ ...value, classes: value.classes.includes(level) ? value.classes.filter((item) => item !== level) : [...value.classes, level].sort() });
    const toggleSection = (id: string) => onChange({ ...value, sectionIds: value.sectionIds.includes(id) ? value.sectionIds.filter((item) => item !== id) : [...value.sectionIds, id] });
    const active = sections.filter((section) => section.active);
    return (
        <div className="grid gap-3 md:col-span-2 md:grid-cols-2">
            <div>
                <Label>Whole classes</Label>
                <p className="text-xs text-muted-foreground">Every student of the class, with or without a section.</p>
                <div className="mt-1 flex flex-wrap gap-3">
                    {SUPPORTED_SCHOOL_CLASSES.map((level) => (
                        <label key={level} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={value.classes.includes(level)} onChange={() => toggleClass(level)} />Class {level}</label>
                    ))}
                </div>
            </div>
            <div>
                <Label>Sections <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <p className="text-xs text-muted-foreground">Only these sections. Nothing ticked anywhere means the whole school.</p>
                <div className="mt-1 flex flex-wrap gap-3">
                    {active.map((section) => (
                        <label key={section.id} className="flex items-center gap-1 text-sm"><input type="checkbox" checked={value.sectionIds.includes(section.id)} onChange={() => toggleSection(section.id)} />{section.label}</label>
                    ))}
                    {!active.length ? <span className="text-xs text-muted-foreground">No sections yet; that is fine, tick classes instead.</span> : null}
                </div>
            </div>
        </div>
    );
}

/** Teachers of a school: add with a phone sign-in, choose their classes or sections, edit, reset, suspend, remove. */
export function TeacherManager({ schoolId, sections, onChanged }: { schoolId?: string | null; sections: SchoolSection[]; onChanged?: () => void }) {
    const [teachers, setTeachers] = useState<SchoolTeacherRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState<TeacherForm>(EMPTY);
    const [editing, setEditing] = useState<SchoolTeacherRow | null>(null);
    const [editForm, setEditForm] = useState<TeacherForm>(EMPTY);
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
            const data = await api<{ password: string | null }>("/api/school/teachers", jsonInit("POST", { ...form, email: form.email || undefined, password: form.password || undefined }));
            setCreated({ name: form.name, phone: form.phone, password: data.password ?? form.password });
            setForm(EMPTY);
            setAdding(false);
            say(`${form.name} was added.`);
            await load();
            onChanged?.();
        } catch (caught) { fail(caught, "The teacher could not be added"); }
        finally { setBusy(false); }
    }

    function startEdit(teacher: SchoolTeacherRow) {
        setAdding(false);
        setEditing(teacher);
        setEditForm({ name: teacher.name, phone: teacher.phone ? formatPhone(teacher.phone) : "", email: teacher.email, password: "", classes: teacher.assignedClassLevels, sectionIds: teacher.assignedSectionIds });
    }

    async function saveEdit(event: React.FormEvent) {
        event.preventDefault();
        if (!editing) return;
        setBusy(true);
        try {
            await api("/api/school/teachers", jsonInit("PATCH", { uid: editing.uid, name: editForm.name, phone: editForm.phone, email: editForm.email, classes: editForm.classes, sectionIds: editForm.sectionIds }));
            setEditing(null);
            say("Teacher updated.");
            await load();
            onChanged?.();
        } catch (caught) { fail(caught, "The teacher could not be updated"); }
        finally { setBusy(false); }
    }

    async function act(teacher: SchoolTeacherRow, action: "suspend" | "unsuspend" | "resetPassword" | "remove") {
        const prompts: Record<typeof action, string> = {
            suspend: `Suspend ${teacher.name}? They will not be able to sign in.`,
            unsuspend: `Let ${teacher.name} sign in again?`,
            resetPassword: `Give ${teacher.name} a new password?`,
            remove: `Remove ${teacher.name} from the school? The account is deleted, so they no longer see your students, and the phone number can be used again.`,
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

    const fields = (value: TeacherForm, set: (next: TeacherForm) => void, prefix: string, withPassword: boolean) => (
        <>
            <div className="space-y-1"><Label htmlFor={`${prefix}-name`}>Full name</Label><Input id={`${prefix}-name`} required value={value.name} onChange={(event) => set({ ...value, name: event.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor={`${prefix}-phone`}>Mobile number</Label><Input id={`${prefix}-phone`} required placeholder="03001234567" value={value.phone} onChange={(event) => set({ ...value, phone: event.target.value })} /></div>
            <div className="space-y-1"><Label htmlFor={`${prefix}-email`}>Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${prefix}-email`} type="email" value={value.email} onChange={(event) => set({ ...value, email: event.target.value })} /></div>
            {withPassword ? <div className="space-y-1"><Label htmlFor={`${prefix}-password`}>Password <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id={`${prefix}-password`} minLength={6} value={value.password} onChange={(event) => set({ ...value, password: event.target.value })} /></div> : <div />}
            <ScopePicker value={value} sections={sections} onChange={(next) => set({ ...value, ...next })} />
        </>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => { setEditing(null); setAdding((open) => !open); }}><Plus className="mr-1 h-4 w-4" />Add teacher</Button>
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
                    <CardHeader><CardTitle className="text-base">New teacher</CardTitle><CardDescription>Tick the whole classes and/or the sections this teacher looks after. Nothing ticked means the whole school.</CardDescription></CardHeader>
                    <CardContent>
                        <form onSubmit={add} className="grid gap-3 md:grid-cols-2">
                            {fields(form, setForm, "te", true)}
                            <div className="flex gap-2 md:col-span-2">
                                <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Add teacher</Button>
                                <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            ) : null}

            {editing ? (
                <Card className="border-indigo-200">
                    <CardHeader><CardTitle className="text-base">Edit {editing.name}</CardTitle><CardDescription>Changing the mobile number or email changes what the teacher signs in with and signs them out of every device; they sign in again with the same password. An email also lets them use "Forgot password".</CardDescription></CardHeader>
                    <CardContent>
                        <form onSubmit={saveEdit} className="grid gap-3 md:grid-cols-2">
                            {fields(editForm, setEditForm, "ed-te", false)}
                            <div className="flex gap-2 md:col-span-2">
                                <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Save</Button>
                                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
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
                                <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">Teacher</th><th className="p-3">Looks after</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead>
                                <tbody className="divide-y">
                                    {teachers.map((teacher) => (
                                        <tr key={teacher.uid} className={teacher.disabled ? "bg-slate-50 text-muted-foreground" : ""}>
                                            <td className="p-3"><strong>{teacher.name}</strong><p className="text-xs text-muted-foreground">{teacher.contact}{teacher.email && teacher.phone ? ` · ${formatPhone(teacher.phone)}` : ""}</p></td>
                                            <td className="p-3"><div className="flex flex-wrap gap-1">{scopeChips(teacher, sections).map((chip) => <Badge key={chip} variant="outline" className="text-[10px]">{chip}</Badge>)}</div></td>
                                            <td className="p-3">{teacher.disabled ? <Badge variant="destructive">Suspended</Badge> : <Badge variant="outline" className="border-emerald-300 text-emerald-700">Active</Badge>}</td>
                                            <td className="p-3">
                                                <div className="flex gap-1">
                                                    <Button size="sm" variant="ghost" title="Edit" onClick={() => startEdit(teacher)}><Pencil className="h-4 w-4" /></Button>
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

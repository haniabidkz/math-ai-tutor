"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Save } from "lucide-react";
import { PlanBadge } from "@/components/school/plan-badge";
import { formatDate, prettyPhone } from "@/components/school/school-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCESS_SETTING_LIMITS, type AccessSettings } from "@/lib/access";
import { adminApi, jsonInit } from "@/lib/admin-api";
import type { School, SchoolAdminRow } from "@/types/school";

const EMPTY_SCHOOL = { name: "", city: "", contactName: "", contactPhone: "", contactEmail: "", seatLimit: "", trialDays: "", plan: "trial", notes: "", adminName: "", adminPhone: "", adminEmail: "", adminPassword: "" };
const toDateInput = (millis: number | null) => (millis ? new Date(millis + 5 * 3_600_000).toISOString().slice(0, 10) : "");

interface Detail { school: School; admins: SchoolAdminRow[]; students: { active: number; graduated: number; premium: number; free: number }; teachers: number; sections: Array<{ id: string; label: string; students: number }> }

/** Super Admin: every school, its plan, seats and admins, plus the platform access settings. */
export function SchoolsAdmin() {
    const [schools, setSchools] = useState<School[]>([]);
    const [settings, setSettings] = useState<AccessSettings | null>(null);
    const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState(EMPTY_SCHOOL);
    const [busy, setBusy] = useState(false);
    const [selected, setSelected] = useState<Detail | null>(null);
    const [edit, setEdit] = useState({ plan: "trial", trialEndsAt: "", paidUntil: "", seatLimit: "", trialFullAccess: false, status: "active", notes: "" });
    const [newAdmin, setNewAdmin] = useState({ name: "", phone: "", email: "", password: "" });
    const [secret, setSecret] = useState<{ who: string; phone: string; password: string } | null>(null);

    useEffect(() => { void load(); }, []);

    async function load() {
        setLoading(true);
        setError("");
        try {
            const data = await adminApi<{ schools: School[]; settings: AccessSettings }>("/api/schools");
            setSchools(data.schools);
            setSettings(data.settings);
            setSettingsDraft(Object.fromEntries(Object.entries(data.settings).map(([key, value]) => [key, String(value)])));
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Schools could not be loaded"); }
        finally { setLoading(false); }
    }

    const say = (message: string) => { setError(""); setNotice(message); window.setTimeout(() => setNotice(""), 6000); };
    const fail = (caught: unknown, fallback: string) => { setNotice(""); setError(caught instanceof Error ? caught.message : fallback); };

    async function open(school: School) {
        try {
            const detail = await adminApi<Detail>(`/api/schools/${school.id}`);
            setSelected(detail);
            setEdit({ plan: detail.school.plan, trialEndsAt: toDateInput(detail.school.trialEndsAt), paidUntil: toDateInput(detail.school.paidUntil), seatLimit: String(detail.school.seatLimit), trialFullAccess: detail.school.trialFullAccess, status: detail.school.status, notes: detail.school.notes });
        } catch (caught) { fail(caught, "The school could not be loaded"); }
    }

    async function create(event: React.FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            const data = await adminApi<{ school: School; admin: { uid: string; password: string | null } }>("/api/schools", jsonInit("POST", {
                name: form.name, city: form.city, contactName: form.contactName, contactPhone: form.contactPhone || undefined, contactEmail: form.contactEmail || undefined,
                seatLimit: form.seatLimit || undefined, trialDays: form.trialDays || undefined, plan: form.plan, notes: form.notes,
                admin: { name: form.adminName, phone: form.adminPhone, email: form.adminEmail || undefined, password: form.adminPassword },
            }));
            setSecret({ who: form.adminName, phone: form.adminPhone, password: form.adminPassword });
            setForm(EMPTY_SCHOOL);
            setCreating(false);
            say(`${data.school.name} created with code ${data.school.code}.`);
            await load();
            await open(data.school);
        } catch (caught) { fail(caught, "The school could not be created"); }
        finally { setBusy(false); }
    }

    async function savePlan(event: React.FormEvent) {
        event.preventDefault();
        if (!selected) return;
        setBusy(true);
        try {
            await adminApi(`/api/schools/${selected.school.id}`, jsonInit("PATCH", {
                plan: edit.plan, trialEndsAt: edit.trialEndsAt || null, paidUntil: edit.paidUntil || null, seatLimit: Number(edit.seatLimit),
                trialFullAccess: edit.trialFullAccess, status: edit.status, notes: edit.notes,
            }));
            say("School updated.");
            await load();
            await open(selected.school);
        } catch (caught) { fail(caught, "The school could not be updated"); }
        finally { setBusy(false); }
    }

    async function addAdmin(event: React.FormEvent) {
        event.preventDefault();
        if (!selected) return;
        setBusy(true);
        try {
            await adminApi(`/api/schools/${selected.school.id}`, jsonInit("POST", { action: "addAdmin", admin: { ...newAdmin, email: newAdmin.email || undefined } }));
            setSecret({ who: newAdmin.name, phone: newAdmin.phone, password: newAdmin.password });
            setNewAdmin({ name: "", phone: "", email: "", password: "" });
            say("Admin added.");
            await open(selected.school);
        } catch (caught) { fail(caught, "The admin could not be added"); }
        finally { setBusy(false); }
    }

    async function adminAction(admin: SchoolAdminRow, action: "suspend" | "unsuspend" | "resetPassword" | "remove") {
        if (!selected) return;
        if (!window.confirm(`${action === "resetPassword" ? "Reset the password of" : action === "remove" ? "Remove" : action === "suspend" ? "Suspend" : "Reactivate"} ${admin.name}?`)) return;
        try {
            const data = await adminApi<{ password: string | null }>(`/api/schools/${selected.school.id}`, jsonInit("POST", { action: "adminAction", memberAction: action, uid: admin.uid }));
            if (data.password) setSecret({ who: admin.name, phone: admin.phone ?? "", password: data.password });
            say("Done.");
            await open(selected.school);
        } catch (caught) { fail(caught, "The action failed"); }
    }

    async function recount() {
        if (!selected) return;
        try {
            const data = await adminApi<{ seatsUsed: number }>(`/api/schools/${selected.school.id}`, jsonInit("POST", { action: "recountSeats" }));
            say(`Seats recounted: ${data.seatsUsed} in use.`);
            await load();
            await open(selected.school);
        } catch (caught) { fail(caught, "The recount failed"); }
    }

    async function saveSettings() {
        try {
            const data = await adminApi<{ settings: AccessSettings }>("/api/admin/settings", jsonInit("PATCH", settingsDraft));
            setSettings(data.settings);
            say("Access settings saved.");
        } catch (caught) { fail(caught, "Settings could not be saved"); }
    }

    return (
        <div className="space-y-5">
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {notice ? <Alert className="border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}
            {secret ? (
                <Alert className="border-indigo-300 bg-indigo-50">
                    <KeyRound className="h-4 w-4" />
                    <AlertDescription><strong>{secret.who}</strong> signs in at <code>/login?role=school</code> with phone <strong>{prettyPhone(secret.phone)}</strong> and password <code className="rounded bg-white px-1.5 py-0.5 font-mono">{secret.password}</code>. Share it now; it is not shown again. <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>Hide</Button></AlertDescription>
                </Alert>
            ) : null}

            <section className="rounded-lg bg-white p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div><h2 className="font-semibold">Schools</h2><p className="text-xs text-muted-foreground">Each school gets a code, a 14-day trial, a seat limit and its own admin panel. Students join with the code or are added by the school.</p></div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}><RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
                        <Button size="sm" onClick={() => setCreating((open) => !open)}><Plus className="mr-1 h-4 w-4" />New school</Button>
                    </div>
                </div>

                {creating ? (
                    <form onSubmit={create} className="mb-4 grid gap-3 rounded-md border bg-slate-50 p-4 md:grid-cols-3">
                        <p className="text-sm font-semibold md:col-span-3">School</p>
                        <div className="space-y-1"><Label htmlFor="ns-name">School name</Label><Input id="ns-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-city">City</Label><Input id="ns-city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></div>
                        <div className="space-y-1">
                            <Label htmlFor="ns-plan">Starts on</Label>
                            <select id="ns-plan" className="h-9 w-full rounded-md border px-2 text-sm" value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })}><option value="trial">14-day free trial</option><option value="paid">Paid plan</option></select>
                        </div>
                        <div className="space-y-1"><Label htmlFor="ns-seats">Seat limit <span className="font-normal text-muted-foreground">(default {settings?.defaultSeatLimit ?? 100})</span></Label><Input id="ns-seats" type="number" min={1} value={form.seatLimit} onChange={(event) => setForm({ ...form, seatLimit: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-trial">Trial days <span className="font-normal text-muted-foreground">(default {settings?.trialDays ?? 14})</span></Label><Input id="ns-trial" type="number" min={1} value={form.trialDays} onChange={(event) => setForm({ ...form, trialDays: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-contact">Contact person</Label><Input id="ns-contact" value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-cphone">Contact mobile</Label><Input id="ns-cphone" value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-cemail">Contact email</Label><Input id="ns-cemail" type="email" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-notes">Notes</Label><Input id="ns-notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
                        <p className="text-sm font-semibold md:col-span-3">First school admin (signs in with phone + password)</p>
                        <div className="space-y-1"><Label htmlFor="ns-aname">Admin name</Label><Input id="ns-aname" required value={form.adminName} onChange={(event) => setForm({ ...form, adminName: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-aphone">Admin mobile</Label><Input id="ns-aphone" required placeholder="03001234567" value={form.adminPhone} onChange={(event) => setForm({ ...form, adminPhone: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-aemail">Admin email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="ns-aemail" type="email" value={form.adminEmail} onChange={(event) => setForm({ ...form, adminEmail: event.target.value })} /></div>
                        <div className="space-y-1"><Label htmlFor="ns-apass">Admin password</Label><Input id="ns-apass" required minLength={6} value={form.adminPassword} onChange={(event) => setForm({ ...form, adminPassword: event.target.value })} /></div>
                        <div className="flex items-end gap-2 md:col-span-2">
                            <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Building2 className="mr-2 h-4 w-4" />}Create school</Button>
                            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
                        </div>
                    </form>
                ) : null}

                <div className="overflow-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="bg-slate-100"><tr><th className="p-2">School</th><th className="p-2">Code</th><th className="p-2">Plan</th><th className="p-2">Seats</th><th className="p-2">Created</th><th className="p-2"></th></tr></thead>
                        <tbody className="divide-y">
                            {!loading && schools.length === 0 ? <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">No schools yet.</td></tr> : null}
                            {schools.map((school) => (
                                <tr key={school.id} className={selected?.school.id === school.id ? "bg-indigo-50/60" : ""}>
                                    <td className="p-2"><strong>{school.name}</strong><p className="text-xs text-muted-foreground">{school.city}{school.contactName ? ` · ${school.contactName}` : ""}</p></td>
                                    <td className="p-2 font-mono">{school.code}</td>
                                    <td className="p-2"><PlanBadge plan={school.effectivePlan} trialDaysLeft={school.trialDaysLeft} status={school.status} /></td>
                                    <td className="p-2">{school.seatsUsed} / {school.seatLimit}</td>
                                    <td className="p-2">{formatDate(school.createdAt)}</td>
                                    <td className="p-2"><div className="flex gap-1"><Button size="sm" variant="outline" onClick={() => open(school)}>Manage</Button><Button size="sm" variant="ghost" asChild><Link href={`/school-admin?schoolId=${school.id}`}><ExternalLink className="mr-1 h-4 w-4" />Open panel</Link></Button></div></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {selected ? (
                <section className="grid gap-4 lg:grid-cols-2">
                    <Card>
                        <CardHeader><CardTitle className="text-base">{selected.school.name} · plan and seats</CardTitle><CardDescription>{selected.students.active} students ({selected.students.premium} paid plan, {selected.students.free} free), {selected.teachers} teachers, {selected.sections.length} sections.</CardDescription></CardHeader>
                        <CardContent>
                            <form onSubmit={savePlan} className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                    <Label htmlFor="ed-plan">Plan</Label>
                                    <select id="ed-plan" className="h-9 w-full rounded-md border px-2 text-sm" value={edit.plan} onChange={(event) => setEdit({ ...edit, plan: event.target.value })}><option value="trial">Trial</option><option value="paid">Paid</option><option value="expired">Expired / free</option></select>
                                </div>
                                <div className="space-y-1"><Label htmlFor="ed-seats">Seat limit</Label><Input id="ed-seats" type="number" min={1} value={edit.seatLimit} onChange={(event) => setEdit({ ...edit, seatLimit: event.target.value })} /></div>
                                <div className="space-y-1"><Label htmlFor="ed-trial">Trial ends</Label><Input id="ed-trial" type="date" value={edit.trialEndsAt} onChange={(event) => setEdit({ ...edit, trialEndsAt: event.target.value })} /></div>
                                <div className="space-y-1"><Label htmlFor="ed-paid">Paid until <span className="font-normal text-muted-foreground">(blank = no end)</span></Label><Input id="ed-paid" type="date" value={edit.paidUntil} onChange={(event) => setEdit({ ...edit, paidUntil: event.target.value })} /></div>
                                <div className="space-y-1">
                                    <Label htmlFor="ed-status">Status</Label>
                                    <select id="ed-status" className="h-9 w-full rounded-md border px-2 text-sm" value={edit.status} onChange={(event) => setEdit({ ...edit, status: event.target.value })}><option value="active">Active</option><option value="suspended">Suspended (nobody can use it)</option></select>
                                </div>
                                <div className="space-y-1"><Label htmlFor="ed-notes">Notes</Label><Input id="ed-notes" value={edit.notes} onChange={(event) => setEdit({ ...edit, notes: event.target.value })} /></div>
                                <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={edit.trialFullAccess} onChange={(event) => setEdit({ ...edit, trialFullAccess: event.target.checked })} />Demo trial: open the whole curriculum during the trial</label>
                                <div className="flex flex-wrap gap-2 sm:col-span-2">
                                    <Button type="submit" disabled={busy}><Save className="mr-2 h-4 w-4" />Save</Button>
                                    <Button type="button" variant="outline" onClick={recount}>Recount seats</Button>
                                    <Button type="button" variant="ghost" asChild><Link href={`/school-admin?schoolId=${selected.school.id}`}>Open the school panel</Link></Button>
                                    <Button type="button" variant="ghost" onClick={() => setSelected(null)}>Close</Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle className="text-base">School admins</CardTitle><CardDescription>They sign in at /login?role=school with phone and password.</CardDescription></CardHeader>
                        <CardContent className="space-y-3">
                            <ul className="divide-y rounded-md border">
                                {selected.admins.length === 0 ? <li className="p-3 text-sm text-muted-foreground">No admin yet.</li> : null}
                                {selected.admins.map((admin) => (
                                    <li key={admin.uid} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                                        <span><strong>{admin.name}</strong> <span className="text-muted-foreground">· {admin.contact}</span>{admin.disabled ? <Badge variant="destructive" className="ml-2">Suspended</Badge> : null}</span>
                                        <span className="flex gap-1">
                                            <Button size="sm" variant="ghost" onClick={() => adminAction(admin, "resetPassword")}>Reset password</Button>
                                            <Button size="sm" variant="ghost" onClick={() => adminAction(admin, admin.disabled ? "unsuspend" : "suspend")}>{admin.disabled ? "Reactivate" : "Suspend"}</Button>
                                            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => adminAction(admin, "remove")}>Remove</Button>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                            <form onSubmit={addAdmin} className="grid gap-2 sm:grid-cols-2">
                                <Input required placeholder="Name" value={newAdmin.name} onChange={(event) => setNewAdmin({ ...newAdmin, name: event.target.value })} />
                                <Input required placeholder="Mobile 03001234567" value={newAdmin.phone} onChange={(event) => setNewAdmin({ ...newAdmin, phone: event.target.value })} />
                                <Input type="email" placeholder="Email (optional)" value={newAdmin.email} onChange={(event) => setNewAdmin({ ...newAdmin, email: event.target.value })} />
                                <Input required minLength={6} placeholder="Password" value={newAdmin.password} onChange={(event) => setNewAdmin({ ...newAdmin, password: event.target.value })} />
                                <Button type="submit" size="sm" disabled={busy} className="sm:col-span-2"><Plus className="mr-1 h-4 w-4" />Add admin</Button>
                            </form>
                        </CardContent>
                    </Card>
                </section>
            ) : null}

            {settings ? (
                <section className="max-w-3xl rounded-lg bg-white p-4">
                    <h2 className="font-semibold">Access settings</h2>
                    <p className="mb-3 text-xs text-muted-foreground">What free and trial students can open, how long a trial lasts, and the seats a new school starts with. Individual students stay on the full curriculum unless unticked in Users.</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {(Object.keys(ACCESS_SETTING_LIMITS) as Array<keyof AccessSettings>).map((key) => (
                            <div key={key} className="space-y-1">
                                <Label htmlFor={`setting-${key}`}>{ACCESS_SETTING_LIMITS[key].label}</Label>
                                <Input id={`setting-${key}`} type="number" min={ACCESS_SETTING_LIMITS[key].min} max={ACCESS_SETTING_LIMITS[key].max} value={settingsDraft[key] ?? ""} onChange={(event) => setSettingsDraft({ ...settingsDraft, [key]: event.target.value })} />
                                <p className="text-xs text-muted-foreground">Saved: {settings[key]}</p>
                            </div>
                        ))}
                    </div>
                    <Button className="mt-3" onClick={saveSettings}><Save className="mr-2 h-4 w-4" />Save settings</Button>
                </section>
            ) : null}
        </div>
    );
}

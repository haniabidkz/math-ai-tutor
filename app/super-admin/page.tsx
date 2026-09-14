"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
    BookOpen, Download, FileUp, Gauge, LayoutDashboard, LogOut,
    Pencil, RefreshCw, Save, Settings, ShieldCheck, Trash2, Upload, Users,
} from "lucide-react";
import { QuestionEditor, type QuestionPayload } from "@/components/admin/question-editor";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CONFIG_LIMITS, EDITABLE_CONFIG_KEYS } from "@/lib/config-validation";
import { auth } from "@/lib/firebase";
import type { AssessmentConfig, ContentStatus, MicroConcept, QuestionBankItem } from "@/types/curriculum";

interface Overview {
    metrics: Record<string, number>;
    auditLogs: Array<{ id: string; action?: string; summary?: string; actorEmail?: string }>;
}

interface ManagedUser {
    uid: string;
    email?: string;
    displayName?: string;
    emailVerified: boolean;
    disabled: boolean;
    role?: string;
    superAdmin: boolean;
    isTeacher?: boolean;
    assignedClasses?: number[];
}

const blankConcept = () => ({
    microTag: "", prerequisiteTag: "", classLevel: 6, topicId: "", topicEnglish: "", topicRomanUrdu: "",
    titleEnglish: "", titleRomanUrdu: "", conceptEnglish: "", conceptRomanUrdu: "", family: "algebra",
    visualKind: "expression", imageUrl: "", order: 0, status: "draft" as ContentStatus,
});

/**
 * Every call asks Firebase for the current ID token. Tokens expire after an hour, and the
 * page used to hold the first one forever, so every save failed once it went stale.
 */
async function api(path: string, init?: RequestInit) {
    const current = auth.currentUser;
    if (!current) throw new Error("You are signed out. Please sign in again.");
    const token = await current.getIdToken();
    const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? (response.status === 401 ? "Your session expired. Please sign in again." : "Request failed"));
    return data;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

export default function SuperAdminPage() {
    const router = useRouter();
    const [ready, setReady] = useState(false);
    const [email, setEmail] = useState("");
    const [overview, setOverview] = useState<Overview | null>(null);
    const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
    const [concepts, setConcepts] = useState<MicroConcept[]>([]);
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [config, setConfig] = useState<AssessmentConfig | null>(null);
    const [configDraft, setConfigDraft] = useState<Record<string, string>>({});
    const [editingQuestion, setEditingQuestion] = useState<QuestionBankItem | null>(null);
    const [editorKey, setEditorKey] = useState(0);
    const [conceptForm, setConceptForm] = useState(blankConcept());
    const [filter, setFilter] = useState("");
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => onAuthStateChanged(auth, async (user) => {
        if (!user) return router.replace("/login");
        if (!user.emailVerified) return router.replace("/login?verify=1");
        const result = await user.getIdTokenResult(true);
        if (result.claims.super_admin !== true) {
            setError("This account does not have Super Admin access.");
            setBusy(false);
            return;
        }
        setEmail(user.email ?? "");
        setReady(true);
        await loadAll();
    }), [router]);

    function applyConfig(next: AssessmentConfig) {
        setConfig(next);
        setConfigDraft(Object.fromEntries(EDITABLE_CONFIG_KEYS.map((key) => [key, String(next[key])])));
    }

    async function loadAll() {
        setBusy(true);
        setError("");
        try {
            const [overviewData, questionData, conceptData, userData, configData] = await Promise.all([
                api("/api/admin/overview"), api("/api/admin/questions"),
                api("/api/admin/concepts"), api("/api/admin/users"), api("/api/admin/config"),
            ]);
            setOverview(overviewData);
            setQuestions(questionData.questions);
            setConcepts(conceptData.concepts);
            setUsers(userData.users);
            applyConfig(configData.config);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Admin data could not be loaded");
        } finally {
            setBusy(false);
        }
    }

    function showNotice(message: string) {
        setError("");
        setNotice(message);
        window.setTimeout(() => setNotice(""), 4000);
    }

    const fail = (caught: unknown, fallback: string) => {
        setNotice("");
        setError(caught instanceof Error ? caught.message : fallback);
    };

    const visibleQuestions = useMemo(() => questions.filter((question) =>
        !filter || `${question.id} ${question.microTag} ${question.question.english}`.toLowerCase().includes(filter.toLowerCase())
    ), [filter, questions]);

    async function saveQuestion(payload: QuestionPayload, isUpdate: boolean) {
        try {
            await api("/api/admin/questions", jsonInit(isUpdate ? "PATCH" : "POST", payload));
            setEditingQuestion(null);
            await loadAll();
            showNotice(isUpdate ? "Question updated." : "Question saved.");
            return true;
        } catch (caught) {
            fail(caught, "Question could not be saved");
            return false;
        }
    }

    function editQuestion(question: QuestionBankItem) {
        setEditingQuestion(question);
        setEditorKey((key) => key + 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function deleteQuestion(id: string) {
        if (!window.confirm(`Delete ${id}?`)) return;
        try { await api(`/api/admin/questions?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await loadAll(); showNotice("Question deleted."); }
        catch (caught) { fail(caught, "Delete failed"); }
    }

    async function importQuestions(file: File) {
        try {
            const parsed: unknown = JSON.parse(await file.text());
            const items = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown[] }).questions;
            if (!Array.isArray(items)) throw new Error("JSON must contain a question array");
            await api("/api/admin/questions", jsonInit("POST", { questions: items }));
            await loadAll();
            showNotice(`Imported ${items.length} questions.`);
        } catch (caught) { fail(caught, "Import failed"); }
    }

    function exportQuestions() {
        const url = URL.createObjectURL(new Blob([JSON.stringify(questions, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = "math-ai-tutor-questions.json"; anchor.click(); URL.revokeObjectURL(url);
    }

    async function saveConcept() {
        const payload = {
            microTag: conceptForm.microTag, prerequisiteTag: conceptForm.prerequisiteTag || null,
            classLevel: Number(conceptForm.classLevel), topicId: conceptForm.topicId,
            topicTitle: { english: conceptForm.topicEnglish, romanUrdu: conceptForm.topicRomanUrdu },
            title: { english: conceptForm.titleEnglish, romanUrdu: conceptForm.titleRomanUrdu },
            concept: { english: conceptForm.conceptEnglish, romanUrdu: conceptForm.conceptRomanUrdu },
            family: conceptForm.family, visualKind: conceptForm.visualKind, imageUrl: conceptForm.imageUrl,
            order: Number(conceptForm.order), status: conceptForm.status,
        };
        try { await api("/api/admin/concepts", jsonInit("POST", payload)); setConceptForm(blankConcept()); await loadAll(); showNotice("Concept saved."); }
        catch (caught) { fail(caught, "Concept could not be saved"); }
    }

    function editConcept(concept: MicroConcept) {
        setConceptForm({
            microTag: concept.microTag, prerequisiteTag: concept.prerequisiteTag ?? "", classLevel: concept.classLevel, topicId: concept.topicId,
            topicEnglish: concept.topicTitle.english, topicRomanUrdu: concept.topicTitle.romanUrdu, titleEnglish: concept.title.english,
            titleRomanUrdu: concept.title.romanUrdu, conceptEnglish: concept.concept.english, conceptRomanUrdu: concept.concept.romanUrdu,
            family: concept.family, visualKind: concept.visualKind, imageUrl: concept.imageUrl ?? "", order: concept.order, status: concept.status,
        });
    }

    async function uploadImage(file: File) {
        const form = new FormData(); form.set("image", file);
        try { const data = await api("/api/admin/upload", { method: "POST", body: form }); setConceptForm((current) => ({ ...current, imageUrl: data.url })); showNotice("Image uploaded."); }
        catch (caught) { fail(caught, "Upload failed"); }
    }

    async function userAction(uid: string, action: "disable" | "revoke" | "class" | "assignedClasses", value?: boolean | number | number[]) {
        try { await api("/api/admin/users", jsonInit("PATCH", { uid, action, value })); await loadAll(); showNotice("User updated."); }
        catch (caught) { fail(caught, "User update failed"); }
    }

    function toggleTeacherClass(user: ManagedUser, level: number) {
        const current = user.assignedClasses ?? [];
        const next = current.includes(level) ? current.filter((item) => item !== level) : [...current, level];
        void userAction(user.uid, "assignedClasses", next);
    }

    async function saveConfig() {
        try {
            const data = await api("/api/admin/config", jsonInit("PATCH", configDraft));
            applyConfig(data.config);
            showNotice("Assessment configuration saved.");
        } catch (caught) { fail(caught, "Configuration update failed"); }
    }

    if (busy && !overview && !error) return <div className="flex min-h-screen items-center justify-center">Loading Super Admin...</div>;
    if (!ready) return <main className="mx-auto max-w-xl p-8"><Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertDescription>{error || "Checking access..."}</AlertDescription></Alert></main>;

    return (
        <div className="min-h-screen bg-slate-100">
            <header className="sticky top-0 z-30 border-b bg-slate-950 text-white">
                <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="h-6 w-6 text-emerald-400" />
                        <div><h1 className="font-semibold">SMART Tutor Super Admin</h1><p className="text-xs text-slate-400">{email}</p></div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="border-slate-700 bg-transparent text-white" onClick={() => loadAll()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
                        <Button variant="ghost" size="icon" title="Sign out" onClick={() => signOut(auth).then(() => router.replace("/login"))}><LogOut className="h-4 w-4" /></Button>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-[1500px] p-4 md:p-6">
                {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
                {notice ? <Alert className="mb-4 border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}
                <Tabs defaultValue="overview">
                    <TabsList className="mb-4 h-auto w-full justify-start overflow-x-auto rounded-md bg-white p-1">
                        <TabsTrigger value="overview"><LayoutDashboard className="mr-2 h-4 w-4" />Overview</TabsTrigger>
                        <TabsTrigger value="questions"><BookOpen className="mr-2 h-4 w-4" />Questions</TabsTrigger>
                        <TabsTrigger value="curriculum"><Gauge className="mr-2 h-4 w-4" />Curriculum</TabsTrigger>
                        <TabsTrigger value="users"><Users className="mr-2 h-4 w-4" />Users</TabsTrigger>
                        <TabsTrigger value="config"><Settings className="mr-2 h-4 w-4" />Configuration</TabsTrigger>
                    </TabsList>

                    <TabsContent value="overview" className="space-y-5">
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                            {Object.entries(overview?.metrics ?? {}).map(([key, value]) => (
                                <Card key={key} className="rounded-md">
                                    <CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</CardTitle></CardHeader>
                                    <CardContent><p className="text-3xl font-bold">{value}</p></CardContent>
                                </Card>
                            ))}
                        </div>
                        <section className="bg-white p-4">
                            <h2 className="mb-3 font-semibold">Recent audit activity</h2>
                            <div className="divide-y">
                                {overview?.auditLogs.map((log) => (
                                    <div key={log.id} className="grid gap-1 py-3 text-sm md:grid-cols-[180px_1fr_220px]">
                                        <strong>{log.action}</strong><span>{log.summary}</span><span className="text-muted-foreground">{log.actorEmail}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </TabsContent>

                    <TabsContent value="questions" className="space-y-5">
                        <section className="bg-white p-4">
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="font-semibold">{editingQuestion ? `Editing ${editingQuestion.id}` : "New question"}</h2>
                                    <p className="text-xs text-muted-foreground">One correct answer and three wrong options, each with the reason it is wrong.</p>
                                </div>
                                <div className="flex gap-2">
                                    <Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm">
                                        <FileUp className="mr-2 h-4 w-4" />Import JSON
                                        <Input type="file" accept="application/json" className="hidden" onChange={(event) => event.target.files?.[0] && importQuestions(event.target.files[0])} />
                                    </Label>
                                    <Button variant="outline" onClick={exportQuestions}><Download className="mr-2 h-4 w-4" />Export</Button>
                                </div>
                            </div>
                            <QuestionEditor
                                key={editorKey}
                                concepts={concepts}
                                initial={editingQuestion}
                                onSave={saveQuestion}
                                onClear={() => { setEditingQuestion(null); setEditorKey((key) => key + 1); }}
                            />
                        </section>
                        <section className="bg-white p-4">
                            <Input placeholder="Filter questions" value={filter} onChange={(event) => setFilter(event.target.value)} className="mb-3 max-w-md" />
                            <div className="max-h-[620px] overflow-auto">
                                <table className="w-full min-w-[960px] text-left text-sm">
                                    <thead className="sticky top-0 bg-slate-100">
                                        <tr><th className="p-2">ID</th><th className="p-2">Concept</th><th className="p-2">Class</th><th className="p-2">Difficulty</th><th className="p-2">Status</th><th className="p-2">Reasons</th><th className="p-2">Question</th><th className="p-2">Actions</th></tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {visibleQuestions.map((question) => {
                                            const written = Object.keys(question.optionAnalysis ?? {}).length;
                                            return (
                                                <tr key={question.id}>
                                                    <td className="p-2 font-mono text-xs">{question.id}</td>
                                                    <td className="p-2">{question.microTag}</td>
                                                    <td className="p-2">Class {question.classLevel}</td>
                                                    <td className="p-2"><Badge variant="outline">{question.difficulty}</Badge></td>
                                                    <td className="p-2">{question.status}</td>
                                                    <td className="p-2">{written === 3 ? <Badge variant="secondary">3 saved</Badge> : <span className="text-xs text-muted-foreground">auto</span>}</td>
                                                    <td className="max-w-md p-2">{question.question.english}</td>
                                                    <td className="p-2">
                                                        <div className="flex gap-1">
                                                            <Button size="icon" variant="ghost" title="Edit" onClick={() => editQuestion(question)}><Pencil className="h-4 w-4" /></Button>
                                                            <Button size="icon" variant="ghost" title="Delete" onClick={() => deleteQuestion(question.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </TabsContent>

                    <TabsContent value="curriculum" className="space-y-5">
                        <section className="bg-white p-4">
                            <h2 className="mb-4 font-semibold">Curriculum editor</h2>
                            <div className="grid gap-3 md:grid-cols-4">
                                <Field label="Micro tag" value={conceptForm.microTag} onChange={(value) => setConceptForm({ ...conceptForm, microTag: value })} />
                                <SelectField label="Prerequisite" value={conceptForm.prerequisiteTag} options={[["", "None"], ...concepts.map((concept) => [concept.microTag, concept.title.english])]} onChange={(value) => setConceptForm({ ...conceptForm, prerequisiteTag: value })} />
                                <Field label="Class" type="number" value={String(conceptForm.classLevel)} onChange={(value) => setConceptForm({ ...conceptForm, classLevel: Number(value) })} />
                                <Field label="Topic ID" value={conceptForm.topicId} onChange={(value) => setConceptForm({ ...conceptForm, topicId: value })} />
                                <Field label="Topic (English)" value={conceptForm.topicEnglish} onChange={(value) => setConceptForm({ ...conceptForm, topicEnglish: value })} />
                                <Field label="Topic (Roman Urdu)" value={conceptForm.topicRomanUrdu} onChange={(value) => setConceptForm({ ...conceptForm, topicRomanUrdu: value })} />
                                <Field label="Title (English)" value={conceptForm.titleEnglish} onChange={(value) => setConceptForm({ ...conceptForm, titleEnglish: value })} />
                                <Field label="Title (Roman Urdu)" value={conceptForm.titleRomanUrdu} onChange={(value) => setConceptForm({ ...conceptForm, titleRomanUrdu: value })} />
                                <Field label="Summary (English)" value={conceptForm.conceptEnglish} onChange={(value) => setConceptForm({ ...conceptForm, conceptEnglish: value })} />
                                <Field label="Summary (Roman Urdu)" value={conceptForm.conceptRomanUrdu} onChange={(value) => setConceptForm({ ...conceptForm, conceptRomanUrdu: value })} />
                                <SelectField label="Family" value={conceptForm.family} options={[["foundation", "Foundation"], ["integer", "Integer"], ["algebra", "Algebra"], ["equation", "Equation"], ["ratio", "Ratio"]]} onChange={(value) => setConceptForm({ ...conceptForm, family: value })} />
                                <SelectField label="Visual" value={conceptForm.visualKind} options={[["number-line", "Number line"], ["fraction", "Fraction"], ["expression", "Expression"], ["balance", "Balance"], ["ratio", "Ratio"], ["pattern", "Pattern"]]} onChange={(value) => setConceptForm({ ...conceptForm, visualKind: value })} />
                                <Field label="Image URL" value={conceptForm.imageUrl} onChange={(value) => setConceptForm({ ...conceptForm, imageUrl: value })} />
                                <Label className="flex cursor-pointer items-end gap-2 rounded-md border p-2 text-sm">
                                    <Upload className="h-4 w-4" />Upload image
                                    <Input type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0])} />
                                </Label>
                                <Field label="Order" type="number" value={String(conceptForm.order)} onChange={(value) => setConceptForm({ ...conceptForm, order: Number(value) })} />
                                <SelectField label="Status" value={conceptForm.status} options={[["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]]} onChange={(value) => setConceptForm({ ...conceptForm, status: value as ContentStatus })} />
                            </div>
                            <div className="mt-4 flex gap-2">
                                <Button onClick={saveConcept}><Save className="mr-2 h-4 w-4" />Save concept</Button>
                                <Button variant="outline" onClick={() => setConceptForm(blankConcept())}>Clear</Button>
                            </div>
                        </section>
                        <section className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                            {concepts.map((concept) => (
                                <Card key={concept.microTag} className="rounded-md">
                                    <CardHeader className="pb-2">
                                        <div className="flex items-start justify-between">
                                            <Badge variant="outline">Class {concept.classLevel}</Badge>
                                            <Button size="icon" variant="ghost" title="Edit concept" onClick={() => editConcept(concept)}><Pencil className="h-4 w-4" /></Button>
                                        </div>
                                        <CardTitle className="text-base">{concept.title.english}</CardTitle>
                                    </CardHeader>
                                    <CardContent className="text-sm text-muted-foreground">
                                        <p className="font-mono text-xs">{concept.microTag}</p>
                                        <p className="mt-2">Prerequisite: {concept.prerequisiteTag ?? "None"}</p>
                                    </CardContent>
                                </Card>
                            ))}
                        </section>
                    </TabsContent>

                    <TabsContent value="users">
                        <section className="bg-white p-4">
                            <h2 className="mb-1 font-semibold">Authentication users</h2>
                            <p className="mb-4 text-xs text-muted-foreground">Tick a teacher&apos;s classes to control which classes they can see and assign homework to.</p>
                            <div className="overflow-auto">
                                <table className="w-full min-w-[980px] text-left text-sm">
                                    <thead className="bg-slate-100"><tr><th className="p-2">User</th><th className="p-2">Role</th><th className="p-2">Teacher classes</th><th className="p-2">Verified</th><th className="p-2">Status</th><th className="p-2">Controls</th></tr></thead>
                                    <tbody className="divide-y">
                                        {users.map((managedUser) => (
                                            <tr key={managedUser.uid}>
                                                <td className="p-2"><strong>{managedUser.displayName ?? managedUser.email}</strong><p className="font-mono text-xs text-muted-foreground">{managedUser.email}</p></td>
                                                <td className="p-2">{managedUser.superAdmin ? "super_admin" : managedUser.role ?? "profile role"}</td>
                                                <td className="p-2">
                                                    {managedUser.isTeacher ? (
                                                        <div className="flex gap-3">
                                                            {[6, 7, 8].map((level) => (
                                                                <label key={level} className="flex items-center gap-1 text-xs">
                                                                    <input type="checkbox" checked={(managedUser.assignedClasses ?? []).includes(level)} onChange={() => toggleTeacherClass(managedUser, level)} />
                                                                    {level}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    ) : <span className="text-xs text-muted-foreground">—</span>}
                                                </td>
                                                <td className="p-2">{managedUser.emailVerified ? "Yes" : "No"}</td>
                                                <td className="p-2">{managedUser.disabled ? "Disabled" : "Active"}</td>
                                                <td className="p-2">
                                                    <div className="flex gap-2">
                                                        <Button size="sm" variant="outline" onClick={() => userAction(managedUser.uid, "disable", !managedUser.disabled)}>{managedUser.disabled ? "Enable" : "Disable"}</Button>
                                                        <Button size="sm" variant="outline" onClick={() => userAction(managedUser.uid, "revoke")}>Revoke sessions</Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </TabsContent>

                    <TabsContent value="config">
                        <section className="max-w-3xl bg-white p-4">
                            <h2 className="mb-4 font-semibold">Assessment configuration</h2>
                            {config ? (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {EDITABLE_CONFIG_KEYS.map((key) => {
                                        const limits = CONFIG_LIMITS[key];
                                        return (
                                            <div key={key} className="space-y-1">
                                                <Label htmlFor={`config-${key}`}>{limits.label}</Label>
                                                <Input
                                                    id={`config-${key}`}
                                                    type="number"
                                                    min={limits.min}
                                                    max={limits.max}
                                                    step={1}
                                                    value={configDraft[key] ?? ""}
                                                    onChange={(event) => setConfigDraft((current) => ({ ...current, [key]: event.target.value }))}
                                                />
                                                <p className="text-xs text-muted-foreground">Allowed: {limits.min} to {limits.max}. Saved value: {config[key]}.</p>
                                            </div>
                                        );
                                    })}
                                    <div className="space-y-1 rounded-md border bg-slate-50 p-3 text-sm sm:col-span-2">
                                        <p><strong>Fixed by the product rules:</strong></p>
                                        <p>Diagnostic test: {config.diagnosticQuestionCount} questions (5 topics × 3).</p>
                                        <p>Scoring: +1 for a correct answer. Wrong answers and hints never deduct marks.</p>
                                    </div>
                                    <Button onClick={saveConfig} className="w-fit"><Save className="mr-2 h-4 w-4" />Save configuration</Button>
                                </div>
                            ) : null}
                        </section>
                    </TabsContent>
                </Tabs>
            </main>
        </div>
    );
}

function Field({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
    return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
    return (
        <div className="space-y-1">
            <Label>{label}</Label>
            <Select value={value || undefined} onValueChange={(next) => onChange(next === "none" ? "" : next)}>
                <SelectTrigger className="w-full"><SelectValue placeholder={`Select ${label}`} /></SelectTrigger>
                <SelectContent>{options.map(([id, title]) => <SelectItem key={id || "none"} value={id || "none"}>{title}</SelectItem>)}</SelectContent>
            </Select>
        </div>
    );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
    Archive, BookOpen, Download, FileUp, Gauge, LayoutDashboard, LogOut,
    Pencil, Plus, RefreshCw, Save, Settings, ShieldCheck, Trash2, Upload, Users,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/lib/firebase";
import type { AssessmentConfig, ContentStatus, Difficulty, MicroConcept, QuestionBankItem } from "@/types/curriculum";

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
}

const blankQuestion = () => ({
    id: "", microTag: "", classLevel: 6, difficulty: "easy" as Difficulty,
    questionEnglish: "", questionRomanUrdu: "", optionA: "", optionB: "", optionC: "", optionD: "",
    optionARoman: "", optionBRoman: "", optionCRoman: "", optionDRoman: "",
    correctOptionId: "A" as "A" | "B" | "C" | "D", hintEnglish: "", hintRomanUrdu: "",
    explanationEnglish: "", explanationRomanUrdu: "", source: "sindh" as "sindh" | "oxford",
    status: "draft" as ContentStatus, version: 1,
});

const blankConcept = () => ({
    microTag: "", prerequisiteTag: "", classLevel: 6, topicId: "", topicEnglish: "", topicRomanUrdu: "",
    titleEnglish: "", titleRomanUrdu: "", conceptEnglish: "", conceptRomanUrdu: "", family: "algebra",
    visualKind: "expression", imageUrl: "", order: 0, status: "draft" as ContentStatus,
});

export default function SuperAdminPage() {
    const router = useRouter();
    const [token, setToken] = useState("");
    const [email, setEmail] = useState("");
    const [overview, setOverview] = useState<Overview | null>(null);
    const [questions, setQuestions] = useState<QuestionBankItem[]>([]);
    const [concepts, setConcepts] = useState<MicroConcept[]>([]);
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [config, setConfig] = useState<AssessmentConfig | null>(null);
    const [questionForm, setQuestionForm] = useState(blankQuestion());
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
        setToken(result.token);
        await loadAll(result.token);
    }), [router]);

    async function api(path: string, authToken = token, init?: RequestInit) {
        const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${authToken}`, ...(init?.headers ?? {}) } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Request failed");
        return data;
    }

    async function loadAll(authToken = token) {
        setBusy(true);
        setError("");
        try {
            const [overviewData, questionData, conceptData, userData, configData] = await Promise.all([
                api("/api/admin/overview", authToken), api("/api/admin/questions", authToken),
                api("/api/admin/concepts", authToken), api("/api/admin/users", authToken), api("/api/admin/config", authToken),
            ]);
            setOverview(overviewData);
            setQuestions(questionData.questions);
            setConcepts(conceptData.concepts);
            setUsers(userData.users);
            setConfig(configData.config);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Admin data could not be loaded");
        } finally {
            setBusy(false);
        }
    }

    function showNotice(message: string) {
        setNotice(message);
        window.setTimeout(() => setNotice(""), 3500);
    }

    const visibleQuestions = useMemo(() => questions.filter((question) =>
        !filter || `${question.id} ${question.microTag} ${question.question.english}`.toLowerCase().includes(filter.toLowerCase())
    ), [filter, questions]);

    async function saveQuestion() {
        const payload = {
            ...(questionForm.id ? { id: questionForm.id } : {}), microTag: questionForm.microTag,
            prerequisiteTag: concepts.find((concept) => concept.microTag === questionForm.microTag)?.prerequisiteTag ?? null,
            classLevel: Number(questionForm.classLevel), difficulty: questionForm.difficulty,
            question: { english: questionForm.questionEnglish, romanUrdu: questionForm.questionRomanUrdu },
            options: (["A", "B", "C", "D"] as const).map((id) => ({ id, english: questionForm[`option${id}`], romanUrdu: questionForm[`option${id}Roman`] || questionForm[`option${id}`] })),
            correctOptionId: questionForm.correctOptionId,
            hint: { english: questionForm.hintEnglish, romanUrdu: questionForm.hintRomanUrdu },
            explanation: { english: questionForm.explanationEnglish, romanUrdu: questionForm.explanationRomanUrdu },
            source: questionForm.source, status: questionForm.status, version: Number(questionForm.version),
        };
        try {
            await api("/api/admin/questions", token, { method: questionForm.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            setQuestionForm(blankQuestion());
            await loadAll();
            showNotice("Question saved.");
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Question could not be saved"); }
    }

    function editQuestion(question: QuestionBankItem) {
        setQuestionForm({
            id: question.id, microTag: question.microTag, classLevel: question.classLevel, difficulty: question.difficulty,
            questionEnglish: question.question.english, questionRomanUrdu: question.question.romanUrdu,
            optionA: question.options[0].english, optionB: question.options[1].english, optionC: question.options[2].english, optionD: question.options[3].english,
            optionARoman: question.options[0].romanUrdu, optionBRoman: question.options[1].romanUrdu, optionCRoman: question.options[2].romanUrdu, optionDRoman: question.options[3].romanUrdu,
            correctOptionId: question.correctOptionId, hintEnglish: question.hint.english, hintRomanUrdu: question.hint.romanUrdu,
            explanationEnglish: question.explanation.english, explanationRomanUrdu: question.explanation.romanUrdu,
            source: question.source, status: question.status, version: question.version,
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async function deleteQuestion(id: string) {
        if (!window.confirm(`Delete ${id}?`)) return;
        try { await api(`/api/admin/questions?id=${encodeURIComponent(id)}`, token, { method: "DELETE" }); await loadAll(); showNotice("Question deleted."); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Delete failed"); }
    }

    async function importQuestions(file: File) {
        try {
            const parsed: unknown = JSON.parse(await file.text());
            const items = Array.isArray(parsed) ? parsed : (parsed as { questions?: unknown[] }).questions;
            if (!Array.isArray(items)) throw new Error("JSON must contain a question array");
            await api("/api/admin/questions", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ questions: items }) });
            await loadAll(); showNotice(`Imported ${items.length} questions.`);
        } catch (caught) { setError(caught instanceof Error ? caught.message : "Import failed"); }
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
        try { await api("/api/admin/concepts", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); setConceptForm(blankConcept()); await loadAll(); showNotice("Concept saved."); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Concept could not be saved"); }
    }

    function editConcept(concept: MicroConcept) {
        setConceptForm({ microTag: concept.microTag, prerequisiteTag: concept.prerequisiteTag ?? "", classLevel: concept.classLevel, topicId: concept.topicId,
            topicEnglish: concept.topicTitle.english, topicRomanUrdu: concept.topicTitle.romanUrdu, titleEnglish: concept.title.english,
            titleRomanUrdu: concept.title.romanUrdu, conceptEnglish: concept.concept.english, conceptRomanUrdu: concept.concept.romanUrdu,
            family: concept.family, visualKind: concept.visualKind, imageUrl: concept.imageUrl ?? "", order: concept.order, status: concept.status });
    }

    async function uploadImage(file: File) {
        const form = new FormData(); form.set("image", file);
        try { const data = await api("/api/admin/upload", token, { method: "POST", body: form }); setConceptForm((current) => ({ ...current, imageUrl: data.url })); showNotice("Image uploaded."); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Upload failed"); }
    }

    async function userAction(uid: string, action: "disable" | "revoke" | "class", value?: boolean | number) {
        try { await api("/api/admin/users", token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, action, value }) }); await loadAll(); showNotice("User updated."); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "User update failed"); }
    }

    async function saveConfig() {
        if (!config) return;
        try { const data = await api("/api/admin/config", token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) }); setConfig(data.config); showNotice("Assessment configuration saved."); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Configuration update failed"); }
    }

    if (busy && !overview) return <div className="flex min-h-screen items-center justify-center">Loading Super Admin...</div>;
    if (!token) return <main className="mx-auto max-w-xl p-8"><Alert variant="destructive"><ShieldCheck className="h-4 w-4" /><AlertDescription>{error || "Checking access..."}</AlertDescription></Alert></main>;

    return (
        <div className="min-h-screen bg-slate-100">
            <header className="sticky top-0 z-30 border-b bg-slate-950 text-white"><div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3"><div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-emerald-400" /><div><h1 className="font-semibold">SMART Tutor Super Admin</h1><p className="text-xs text-slate-400">{email}</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" className="border-slate-700 bg-transparent text-white" onClick={() => loadAll()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Button variant="ghost" size="icon" title="Sign out" onClick={() => signOut(auth).then(() => router.replace("/login"))}><LogOut className="h-4 w-4" /></Button></div></div></header>
            <main className="mx-auto max-w-[1500px] p-4 md:p-6">
                {error ? <Alert variant="destructive" className="mb-4"><AlertDescription>{error}</AlertDescription></Alert> : null}
                {notice ? <Alert className="mb-4 border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}
                <Tabs defaultValue="overview"><TabsList className="mb-4 h-auto w-full justify-start overflow-x-auto rounded-md bg-white p-1"><TabsTrigger value="overview"><LayoutDashboard className="mr-2 h-4 w-4" />Overview</TabsTrigger><TabsTrigger value="questions"><BookOpen className="mr-2 h-4 w-4" />Questions</TabsTrigger><TabsTrigger value="curriculum"><Gauge className="mr-2 h-4 w-4" />Curriculum</TabsTrigger><TabsTrigger value="users"><Users className="mr-2 h-4 w-4" />Users</TabsTrigger><TabsTrigger value="config"><Settings className="mr-2 h-4 w-4" />Configuration</TabsTrigger></TabsList>

                    <TabsContent value="overview" className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">{Object.entries(overview?.metrics ?? {}).map(([key, value]) => <Card key={key} className="rounded-md"><CardHeader className="pb-2"><CardTitle className="text-xs uppercase text-muted-foreground">{key.replace(/([A-Z])/g, " $1")}</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{value}</p></CardContent></Card>)}</div><section className="bg-white p-4"><h2 className="mb-3 font-semibold">Recent audit activity</h2><div className="divide-y">{overview?.auditLogs.map((log) => <div key={log.id} className="grid gap-1 py-3 text-sm md:grid-cols-[180px_1fr_220px]"><strong>{log.action}</strong><span>{log.summary}</span><span className="text-muted-foreground">{log.actorEmail}</span></div>)}</div></section></TabsContent>

                    <TabsContent value="questions" className="space-y-5"><section className="bg-white p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Question editor</h2><p className="text-xs text-muted-foreground">Draft, publish, archive, import, and export deterministic MCQs.</p></div><div className="flex gap-2"><Label className="inline-flex cursor-pointer items-center rounded-md border px-3 py-2 text-sm"><FileUp className="mr-2 h-4 w-4" />Import JSON<Input type="file" accept="application/json" className="hidden" onChange={(event) => event.target.files?.[0] && importQuestions(event.target.files[0])} /></Label><Button variant="outline" onClick={exportQuestions}><Download className="mr-2 h-4 w-4" />Export</Button></div></div><div className="grid gap-3 md:grid-cols-4"><Field label="ID (blank for new)" value={questionForm.id} onChange={(value) => setQuestionForm({ ...questionForm, id: value })} /><SelectField label="Concept" value={questionForm.microTag} options={concepts.map((concept) => [concept.microTag, concept.title.english])} onChange={(value) => setQuestionForm({ ...questionForm, microTag: value, classLevel: concepts.find((concept) => concept.microTag === value)?.classLevel ?? 6 })} /><SelectField label="Difficulty" value={questionForm.difficulty} options={[["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]} onChange={(value) => setQuestionForm({ ...questionForm, difficulty: value as Difficulty })} /><SelectField label="Status" value={questionForm.status} options={[["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]]} onChange={(value) => setQuestionForm({ ...questionForm, status: value as ContentStatus })} /><Field label="Question (English)" value={questionForm.questionEnglish} onChange={(value) => setQuestionForm({ ...questionForm, questionEnglish: value })} /><Field label="Question (Roman Urdu)" value={questionForm.questionRomanUrdu} onChange={(value) => setQuestionForm({ ...questionForm, questionRomanUrdu: value })} />{(["A", "B", "C", "D"] as const).map((id) => <Field key={id} label={`Option ${id}`} value={questionForm[`option${id}`]} onChange={(value) => setQuestionForm({ ...questionForm, [`option${id}`]: value })} />)}<SelectField label="Correct option" value={questionForm.correctOptionId} options={[["A", "A"], ["B", "B"], ["C", "C"], ["D", "D"]]} onChange={(value) => setQuestionForm({ ...questionForm, correctOptionId: value as "A" | "B" | "C" | "D" })} /><SelectField label="Source" value={questionForm.source} options={[["sindh", "Sindh"], ["oxford", "Oxford"]]} onChange={(value) => setQuestionForm({ ...questionForm, source: value as "sindh" | "oxford" })} /><Field label="Hint (English)" value={questionForm.hintEnglish} onChange={(value) => setQuestionForm({ ...questionForm, hintEnglish: value })} /><Field label="Hint (Roman Urdu)" value={questionForm.hintRomanUrdu} onChange={(value) => setQuestionForm({ ...questionForm, hintRomanUrdu: value })} /><Field label="Explanation (English)" value={questionForm.explanationEnglish} onChange={(value) => setQuestionForm({ ...questionForm, explanationEnglish: value })} /><Field label="Explanation (Roman Urdu)" value={questionForm.explanationRomanUrdu} onChange={(value) => setQuestionForm({ ...questionForm, explanationRomanUrdu: value })} /></div><div className="mt-4 flex gap-2"><Button onClick={saveQuestion}><Save className="mr-2 h-4 w-4" />Save question</Button><Button variant="outline" onClick={() => setQuestionForm(blankQuestion())}><Plus className="mr-2 h-4 w-4" />Clear</Button></div></section><section className="bg-white p-4"><Input placeholder="Filter questions" value={filter} onChange={(event) => setFilter(event.target.value)} className="mb-3 max-w-md" /><div className="max-h-[620px] overflow-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="sticky top-0 bg-slate-100"><tr><th className="p-2">ID</th><th className="p-2">Concept</th><th className="p-2">Difficulty</th><th className="p-2">Status</th><th className="p-2">Question</th><th className="p-2">Actions</th></tr></thead><tbody className="divide-y">{visibleQuestions.map((question) => <tr key={question.id}><td className="p-2 font-mono text-xs">{question.id}</td><td className="p-2">{question.microTag}</td><td className="p-2"><Badge variant="outline">{question.difficulty}</Badge></td><td className="p-2">{question.status}</td><td className="max-w-md p-2">{question.question.english}</td><td className="p-2"><div className="flex gap-1"><Button size="icon" variant="ghost" title="Edit" onClick={() => editQuestion(question)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Delete" onClick={() => deleteQuestion(question.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></td></tr>)}</tbody></table></div></section></TabsContent>

                    <TabsContent value="curriculum" className="space-y-5"><section className="bg-white p-4"><h2 className="mb-4 font-semibold">Curriculum editor</h2><div className="grid gap-3 md:grid-cols-4"><Field label="Micro tag" value={conceptForm.microTag} onChange={(value) => setConceptForm({ ...conceptForm, microTag: value })} /><SelectField label="Prerequisite" value={conceptForm.prerequisiteTag} options={[["", "None"], ...concepts.map((concept) => [concept.microTag, concept.title.english])]} onChange={(value) => setConceptForm({ ...conceptForm, prerequisiteTag: value })} /><Field label="Class" type="number" value={String(conceptForm.classLevel)} onChange={(value) => setConceptForm({ ...conceptForm, classLevel: Number(value) })} /><Field label="Topic ID" value={conceptForm.topicId} onChange={(value) => setConceptForm({ ...conceptForm, topicId: value })} /><Field label="Topic (English)" value={conceptForm.topicEnglish} onChange={(value) => setConceptForm({ ...conceptForm, topicEnglish: value })} /><Field label="Topic (Roman Urdu)" value={conceptForm.topicRomanUrdu} onChange={(value) => setConceptForm({ ...conceptForm, topicRomanUrdu: value })} /><Field label="Title (English)" value={conceptForm.titleEnglish} onChange={(value) => setConceptForm({ ...conceptForm, titleEnglish: value })} /><Field label="Title (Roman Urdu)" value={conceptForm.titleRomanUrdu} onChange={(value) => setConceptForm({ ...conceptForm, titleRomanUrdu: value })} /><Field label="Summary (English)" value={conceptForm.conceptEnglish} onChange={(value) => setConceptForm({ ...conceptForm, conceptEnglish: value })} /><Field label="Summary (Roman Urdu)" value={conceptForm.conceptRomanUrdu} onChange={(value) => setConceptForm({ ...conceptForm, conceptRomanUrdu: value })} /><SelectField label="Family" value={conceptForm.family} options={[["foundation", "Foundation"], ["integer", "Integer"], ["algebra", "Algebra"], ["equation", "Equation"], ["ratio", "Ratio"]]} onChange={(value) => setConceptForm({ ...conceptForm, family: value })} /><SelectField label="Visual" value={conceptForm.visualKind} options={[["number-line", "Number line"], ["fraction", "Fraction"], ["expression", "Expression"], ["balance", "Balance"], ["ratio", "Ratio"], ["pattern", "Pattern"]]} onChange={(value) => setConceptForm({ ...conceptForm, visualKind: value })} /><Field label="Image URL" value={conceptForm.imageUrl} onChange={(value) => setConceptForm({ ...conceptForm, imageUrl: value })} /><Label className="flex cursor-pointer items-end gap-2 rounded-md border p-2 text-sm"><Upload className="h-4 w-4" />Upload image<Input type="file" accept="image/*" className="hidden" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0])} /></Label><Field label="Order" type="number" value={String(conceptForm.order)} onChange={(value) => setConceptForm({ ...conceptForm, order: Number(value) })} /><SelectField label="Status" value={conceptForm.status} options={[["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]]} onChange={(value) => setConceptForm({ ...conceptForm, status: value as ContentStatus })} /></div><div className="mt-4 flex gap-2"><Button onClick={saveConcept}><Save className="mr-2 h-4 w-4" />Save concept</Button><Button variant="outline" onClick={() => setConceptForm(blankConcept())}>Clear</Button></div></section><section className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">{concepts.map((concept) => <Card key={concept.microTag} className="rounded-md"><CardHeader className="pb-2"><div className="flex items-start justify-between"><Badge variant="outline">Class {concept.classLevel}</Badge><Button size="icon" variant="ghost" title="Edit concept" onClick={() => editConcept(concept)}><Pencil className="h-4 w-4" /></Button></div><CardTitle className="text-base">{concept.title.english}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground"><p className="font-mono text-xs">{concept.microTag}</p><p className="mt-2">Prerequisite: {concept.prerequisiteTag ?? "None"}</p></CardContent></Card>)}</section></TabsContent>

                    <TabsContent value="users"><section className="bg-white p-4"><h2 className="mb-4 font-semibold">Authentication users</h2><div className="overflow-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-100"><tr><th className="p-2">User</th><th className="p-2">Role</th><th className="p-2">Verified</th><th className="p-2">Status</th><th className="p-2">Controls</th></tr></thead><tbody className="divide-y">{users.map((managedUser) => <tr key={managedUser.uid}><td className="p-2"><strong>{managedUser.displayName ?? managedUser.email}</strong><p className="font-mono text-xs text-muted-foreground">{managedUser.uid}</p></td><td className="p-2">{managedUser.superAdmin ? "super_admin" : managedUser.role ?? "profile role"}</td><td className="p-2">{managedUser.emailVerified ? "Yes" : "No"}</td><td className="p-2">{managedUser.disabled ? "Disabled" : "Active"}</td><td className="p-2"><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => userAction(managedUser.uid, "disable", !managedUser.disabled)}>{managedUser.disabled ? "Enable" : "Disable"}</Button><Button size="sm" variant="outline" onClick={() => userAction(managedUser.uid, "revoke")}>Revoke sessions</Button></div></td></tr>)}</tbody></table></div></section></TabsContent>

                    <TabsContent value="config"><section className="max-w-3xl bg-white p-4"><h2 className="mb-4 font-semibold">Assessment configuration</h2>{config ? <div className="grid gap-4 sm:grid-cols-2">{(["diagnosticQuestionCount", "masteryQuestionCount", "weeklyQuestionCount", "weeklyIntervalDays", "masteryThresholdPercent"] as const).map((key) => <Field key={key} label={key.replace(/([A-Z])/g, " $1")} type="number" value={String(config[key])} onChange={(value) => setConfig({ ...config, [key]: Number(value) })} />)}<div className="sm:col-span-2 rounded-md border bg-slate-50 p-3 text-sm">Scoring is fixed at +1 correct, -0.5 first hint, and -1 incorrect.</div><Button onClick={saveConfig} className="w-fit"><Save className="mr-2 h-4 w-4" />Save configuration</Button></div> : null}</section></TabsContent>
                </Tabs>
            </main>
        </div>
    );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
    return <div className="space-y-1"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
    return <div className="space-y-1"><Label>{label}</Label><Select value={value || undefined} onValueChange={(next) => onChange(next === "none" ? "" : next)}><SelectTrigger className="w-full"><SelectValue placeholder={`Select ${label}`} /></SelectTrigger><SelectContent>{options.map(([id, title]) => <SelectItem key={id || "none"} value={id || "none"}>{title}</SelectItem>)}</SelectContent></Select></div>;
}

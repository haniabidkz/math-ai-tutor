"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Bot, FolderOpen, Loader2, PlugZap, Sparkles } from "lucide-react";
import { AiDraftReview, NativeSelect } from "@/components/admin/ai-draft-review";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminApi, jsonInit } from "@/lib/admin-api";
import { topicsForClass } from "@/lib/concept-autofill";
import type { AiStatus } from "@/lib/ai-studio/ai";
import { LEVEL_LABELS, quotaFor, quotaTotal } from "@/lib/ai-studio/quotas";
import { buildTarget, chapterConcepts, type TargetInput } from "@/lib/ai-studio/target";
import { CURRICULUM_NAME, type DraftStatus, type GenerationLevel } from "@/lib/ai-studio/types";
import type { AssessmentConfig, MicroConcept, StudentClassLevel } from "@/types/curriculum";

const NEW = "__new__";

interface DraftSummary {
    id: string;
    status: DraftStatus;
    level: GenerationLevel;
    classLevel: number;
    chapter: string;
    subTopic: string | null;
    microTopic: string | null;
    questionCount: number;
    total: number;
    createdByEmail: string;
    createdAt: number | null;
}

const STATUS_LABELS: Record<DraftStatus, string> = {
    generating: "Generating",
    needs_review: "Ready for review",
    approved: "Live",
    discarded: "Discarded",
};

export function AiStudio({ concepts, config, onPublished }: {
    concepts: MicroConcept[];
    config: AssessmentConfig | null;
    onPublished: () => void;
}) {
    const [status, setStatus] = useState<AiStatus | null>(null);
    const [testing, setTesting] = useState(false);
    const [drafts, setDrafts] = useState<DraftSummary[]>([]);
    const [open, setOpen] = useState<{ id: string; autoRun: boolean } | null>(null);
    const [error, setError] = useState("");
    const [creating, setCreating] = useState(false);

    const [level, setLevel] = useState<GenerationLevel>("micro");
    const [classLevel, setClassLevel] = useState<StudentClassLevel>(6);
    const [chapterId, setChapterId] = useState("");
    const [newChapter, setNewChapter] = useState("");
    const [subTopic, setSubTopic] = useState("");
    const [microTag, setMicroTag] = useState("");
    const [newMicro, setNewMicro] = useState("");
    const [microTags, setMicroTags] = useState<string[]>([]);
    const subTopicListId = useId();

    const loadDrafts = useCallback(async () => {
        try {
            setDrafts((await adminApi<{ drafts: DraftSummary[] }>("/api/admin/ai-studio/drafts")).drafts);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Drafts could not be loaded");
        }
    }, []);

    const checkStatus = useCallback(async (probe: boolean) => {
        setTesting(true);
        try {
            const data = await adminApi<{ status: AiStatus }>("/api/admin/ai-studio/status", { method: probe ? "POST" : "GET" });
            setStatus(data.status);
        } catch (caught) {
            setStatus({
                configured: false, valid: false, canGenerate: false,
                generationProvider: null, verificationProvider: null, generationModel: null, verificationModel: null,
                message: caught instanceof Error ? caught.message : "Could not reach the server",
            });
        } finally {
            setTesting(false);
        }
    }, []);

    // A real test request, so the screen names the services that will actually answer.
    useEffect(() => {
        void checkStatus(true);
        void loadDrafts();
    }, [checkStatus, loadDrafts]);

    const liveConcepts = useMemo(() => concepts.filter((concept) => concept.status !== "archived"), [concepts]);
    const topics = useMemo(() => topicsForClass(liveConcepts, classLevel), [liveConcepts, classLevel]);
    const inChapter = useMemo(() => (chapterId && chapterId !== NEW ? chapterConcepts(liveConcepts, classLevel, chapterId) : []), [liveConcepts, classLevel, chapterId]);
    const knownSubTopics = [...new Set(inChapter.map((concept) => concept.subTopic?.english).filter((value): value is string => Boolean(value)))];
    const quota = quotaFor(level, config);

    const input: TargetInput = {
        level,
        classLevel,
        chapter: { topicId: chapterId && chapterId !== NEW ? chapterId : null, title: chapterId === NEW ? newChapter : "" },
        subTopic: level === "main" ? null : subTopic,
        microTopic: level === "micro" ? { microTag: microTag && microTag !== NEW ? microTag : null, title: microTag === NEW ? newMicro : "" } : null,
        microTags: level === "sub" ? microTags : undefined,
    };
    const built = chapterId ? buildTarget(input, liveConcepts) : { error: "Choose the main topic." };
    const formError = level === "micro" && !microTag && chapterId ? "Choose a micro-topic or add a new one." : "error" in built ? built.error : "";

    function chooseLevel(value: GenerationLevel) {
        setLevel(value);
        setMicroTag("");
        setNewMicro("");
        setMicroTags([]);
        if (value !== "micro" && chapterId === NEW) setChapterId("");
    }

    function chooseClass(value: StudentClassLevel) {
        setClassLevel(value);
        setChapterId("");
        setMicroTag("");
        setMicroTags([]);
    }

    function chooseChapter(value: string) {
        setChapterId(value);
        setMicroTag(value === NEW ? NEW : "");
        setMicroTags([]);
        setSubTopic("");
    }

    async function create() {
        setCreating(true);
        setError("");
        try {
            const data = await adminApi<{ id: string }>("/api/admin/ai-studio/drafts", jsonInit("POST", input));
            setOpen({ id: data.id, autoRun: true });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The draft could not be created");
        } finally {
            setCreating(false);
        }
    }

    if (open) {
        return (
            <AiDraftReview
                key={open.id}
                draftId={open.id}
                autoRun={open.autoRun}
                onClose={() => { setOpen(null); void loadDrafts(); }}
                onPublished={onPublished}
            />
        );
    }

    const ready = status?.canGenerate === true;

    return (
        <div className="space-y-5">
            <section className="space-y-3 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        <h2 className="font-semibold">AI connection</h2>
                        {status === null ? <Badge variant="outline">Checking...</Badge>
                            : ready && status.code ? <Badge className="bg-amber-500">Busy right now</Badge>
                                : ready ? <Badge className="bg-emerald-600">Connected</Badge>
                                    : <Badge variant="destructive">Not ready</Badge>}
                    </div>
                    <Button variant="outline" size="sm" onClick={() => checkStatus(true)} disabled={testing}>
                        {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}Test connection
                    </Button>
                </div>
                {status ? <p className="text-sm">{status.message}</p> : null}
                {ready && status?.code ? (
                    <p className="text-xs text-muted-foreground">You can still generate: the Studio waits and tries again while the free service is busy.</p>
                ) : null}
                {status?.generationProvider ? (
                    <p className="text-xs text-muted-foreground">
                        Writes content with {status.generationProvider}{status.generationModel ? ` (${status.generationModel})` : ""}; {status.verificationProvider}
                        {status.verificationModel ? ` (${status.verificationModel})` : ""} solves every question again to check the answer.
                    </p>
                ) : null}
                {status && !ready && (status.code === "invalid_key" || status.code === "not_configured" || status.code === "no_credit") ? (
                    <p className="text-xs text-muted-foreground">
                        Create a key at platform.openai.com (API keys) and make sure the account has credit. Save it as OPENAI_API_KEY in
                        Vercel → Project → Settings → Environment Variables, then redeploy.
                    </p>
                ) : null}
            </section>

            <section className="space-y-4 bg-white p-4">
                <div>
                    <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-5 w-5 text-violet-600" />Create content with AI</h2>
                    <p className="text-xs text-muted-foreground">
                        {CURRICULUM_NAME}. The AI writes the concept explanation and the exact number of questions below, in simple English and Roman Urdu with local examples. Nothing goes live until you approve it.
                    </p>
                </div>
                {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                <div className="grid gap-3 md:grid-cols-3">
                    <NativeSelect label="Generation level" value={level}
                        options={(["micro", "sub", "main"] as const).map((value) => [value, `${LEVEL_LABELS[value]} · ${quotaTotal(quotaFor(value, config))} questions`])}
                        onChange={(value) => chooseLevel(value as GenerationLevel)} />
                    <NativeSelect label="Class" value={String(classLevel)}
                        options={[["6", "Class 6"], ["7", "Class 7"], ["8", "Class 8"]]}
                        onChange={(value) => chooseClass(Number(value) as StudentClassLevel)} />
                    <NativeSelect label="Main topic (chapter)" value={chapterId}
                        options={[["", "Choose a main topic"], ...topics.map((topic) => [topic.topicId, topic.title.english]), ...(level === "micro" ? [[NEW, "+ New main topic"]] : [])]}
                        onChange={chooseChapter} />
                </div>

                {chapterId === NEW ? <TextInput label="New main topic name" value={newChapter} placeholder="e.g. Fractions" onChange={setNewChapter} /> : null}

                {chapterId && level !== "main" ? (
                    <div className="space-y-1">
                        <TextInput label={level === "sub" ? "Sub-topic" : "Sub-topic (optional)"} value={subTopic} placeholder="e.g. Addition of Unlike Fractions" onChange={setSubTopic} list={subTopicListId} />
                        <datalist id={subTopicListId}>{knownSubTopics.map((value) => <option key={value} value={value} />)}</datalist>
                    </div>
                ) : null}

                {chapterId && level === "micro" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                        <NativeSelect label="Micro-topic" value={microTag}
                            options={[["", "Choose a micro-topic"], ...inChapter.map((concept) => [concept.microTag, concept.title.english]), [NEW, "+ New micro-topic"]]}
                            onChange={setMicroTag} />
                        {microTag === NEW ? <TextInput label="New micro-topic name" value={newMicro} placeholder="e.g. Finding LCM of Denominators" onChange={setNewMicro} /> : null}
                    </div>
                ) : null}

                {chapterId && level === "sub" ? (
                    <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Micro-topics this sub-topic covers</legend>
                        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {inChapter.map((concept) => (
                                <label key={concept.microTag} className="flex items-center gap-2 text-sm">
                                    <input type="checkbox" checked={microTags.includes(concept.microTag)}
                                        onChange={() => setMicroTags((current) => (current.includes(concept.microTag) ? current.filter((tag) => tag !== concept.microTag) : [...current, concept.microTag]))} />
                                    {concept.title.english}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                ) : null}

                {chapterId && level === "main" && inChapter.length ? (
                    <p className="text-sm text-muted-foreground">Questions will be spread across all {inChapter.length} micro-topics: {inChapter.map((concept) => concept.title.english).join(", ")}.</p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-slate-50 p-3 text-sm">
                    <p>
                        <strong>{quotaTotal(quota)} questions</strong>: {quota.easy} easy, {quota.medium} medium, {quota.hard} hard, plus the concept explanation. Every answer is solved a second time by AI, then you review and approve.
                    </p>
                    <Button onClick={create} disabled={!ready || creating || Boolean(formError)}>
                        {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Generate with AI
                    </Button>
                </div>
                {formError && chapterId ? <p className="text-sm text-amber-700">{formError}</p> : null}
                {!ready && status ? <p className="text-sm text-amber-700">Generation is off until the AI connection works.</p> : null}
            </section>

            <section className="bg-white p-4">
                <h2 className="mb-3 font-semibold">Drafts</h2>
                {drafts.length ? (
                    <div className="overflow-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                            <thead className="bg-slate-100">
                                <tr><th className="p-2">Created</th><th className="p-2">Level</th><th className="p-2">Topic</th><th className="p-2">Questions</th><th className="p-2">Status</th><th className="p-2" /></tr>
                            </thead>
                            <tbody className="divide-y">
                                {drafts.map((draft) => (
                                    <tr key={draft.id}>
                                        <td className="p-2 text-xs">{draft.createdAt ? new Date(draft.createdAt).toLocaleString() : "—"}<p className="text-muted-foreground">{draft.createdByEmail}</p></td>
                                        <td className="p-2">{LEVEL_LABELS[draft.level]}</td>
                                        <td className="p-2">Class {draft.classLevel} · {draft.chapter}{draft.subTopic ? ` › ${draft.subTopic}` : ""}{draft.microTopic && draft.level === "micro" ? ` › ${draft.microTopic}` : ""}</td>
                                        <td className="p-2">{draft.questionCount}/{draft.total}</td>
                                        <td className="p-2"><Badge variant={draft.status === "approved" ? "default" : "outline"}>{STATUS_LABELS[draft.status]}</Badge></td>
                                        <td className="p-2"><Button size="sm" variant="outline" onClick={() => setOpen({ id: draft.id, autoRun: false })}><FolderOpen className="mr-2 h-4 w-4" />Open</Button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="text-sm text-muted-foreground">No drafts yet.</p>}
            </section>
        </div>
    );
}

function TextInput({ label, value, placeholder, list, onChange }: { label: string; value: string; placeholder?: string; list?: string; onChange: (value: string) => void }) {
    const id = useId();
    return (
        <div className="space-y-1">
            <Label htmlFor={id}>{label}</Label>
            <Input id={id} value={value} placeholder={placeholder} list={list} onChange={(event) => onChange(event.target.value)} />
        </div>
    );
}

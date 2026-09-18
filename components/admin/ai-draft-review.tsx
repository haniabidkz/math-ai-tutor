"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
    AlertTriangle, ArrowLeft, CheckCircle2, Circle, Loader2, Pause, Pencil, Play,
    Plus, RotateCcw, Rocket, ShieldCheck, SkipForward, Trash2, XCircle,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, adminApi, jsonInit } from "@/lib/admin-api";
import { DIFFICULTIES, LEVEL_LABELS } from "@/lib/ai-studio/quotas";
import {
    NEW_MICRO_TAG, OPTION_LETTERS,
    type DraftConcept, type DraftQuestion, type GenerationDraft, type GenerationStep, type OptionLetter,
} from "@/lib/ai-studio/types";
import { blockingIssues, normalizeText, validateDraft, type DraftIssue } from "@/lib/ai-studio/validate";
import { MISCONCEPTION_TAGS, MISCONCEPTIONS } from "@/lib/mistake-analysis";
import type { Difficulty, LocalizedText, MisconceptionTag } from "@/types/curriculum";

/** Failures worth retrying automatically; a bad key or missing credit stops at once. */
const RETRYABLE = new Set(["failed", "bad_output", "rejected", "refused"]);
const MAX_TRIES = 3;
/**
 * Free services are often busy or allow few requests a minute; waiting is expected, not a
 * failure. The limit counts waits in a row, so a long pool can wait many times in total.
 */
const WAIT_MS: Record<string, number> = { rate_limited: 60_000, busy: 15_000 };
const MAX_WAITS_IN_A_ROW = 20;
const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const capital = (value: string) => `${value[0].toUpperCase()}${value.slice(1)}`;
const errorText = (caught: unknown) => (caught instanceof Error ? caught.message : "Something went wrong");

function describeFailure(caught: unknown): string {
    const problems = caught instanceof ApiError && Array.isArray(caught.body.problems) ? (caught.body.problems as string[]) : [];
    return problems.length ? `${errorText(caught)}: ${problems.slice(0, 3).join("; ")}` : errorText(caught);
}

function stepLabels(steps: GenerationStep[]): Map<string, string> {
    const reached: Partial<Record<Difficulty, number>> = {};
    const labels = new Map<string, string>();
    for (const step of steps) {
        if (step.kind === "concept" || !step.difficulty) {
            labels.set(step.id, "Concept explanation and local example");
            continue;
        }
        const start = (reached[step.difficulty] ?? 0) + 1;
        const end = start + (step.count ?? 0) - 1;
        reached[step.difficulty] = end;
        labels.set(step.id, `${capital(step.difficulty)} questions ${start}–${end}`);
    }
    return labels;
}

const isChecked = (question: DraftQuestion) => question.verification.status === "agrees" || question.verification.status === "confirmed";

export function AiDraftReview({ draftId, autoRun = false, onClose, onPublished }: {
    draftId: string;
    autoRun?: boolean;
    onClose: () => void;
    onPublished: () => void;
}) {
    const [draft, setDraft] = useState<GenerationDraft | null>(null);
    const [liveTexts, setLiveTexts] = useState<string[]>([]);
    const [phase, setPhase] = useState<"idle" | "generating" | "checking" | "approving">("idle");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [waiting, setWaiting] = useState("");
    const [filter, setFilter] = useState<"all" | "problems" | Difficulty>("all");
    const [showDetails, setShowDetails] = useState(true);
    const [openEditors, setOpenEditors] = useState<Set<string>>(new Set());
    const [newKey, setNewKey] = useState<string | null>(null);
    const [replaceLesson, setReplaceLesson] = useState(true);
    const stopRef = useRef(false);
    const startedRef = useRef(false);
    const base = `/api/admin/ai-studio/drafts/${draftId}`;

    const load = useCallback(async () => {
        const data = await adminApi<{ draft: GenerationDraft; liveTexts: string[] }>(base);
        setDraft(data.draft);
        setLiveTexts(data.liveTexts);
        return data.draft;
    }, [base]);

    const liveSet = useMemo(() => new Set(liveTexts.map(normalizeText)), [liveTexts]);
    const issues = useMemo(() => (draft ? validateDraft(draft, liveSet) : []), [draft, liveSet]);
    const blocking = blockingIssues(issues);
    const issuesByKey = useMemo(() => {
        const grouped = new Map<string, DraftIssue[]>();
        for (const issue of issues) grouped.set(issue.where, [...(grouped.get(issue.where) ?? []), issue]);
        return grouped;
    }, [issues]);

    /** Answers every unchecked question, a batch at a time, until none are left. */
    const check = useCallback(async () => {
        stopRef.current = false;
        setError("");
        setPhase("checking");
        let failures = 0;
        let waits = 0;
        try {
            while (!stopRef.current) {
                try {
                    const data = await adminApi<{ draft: GenerationDraft; checked: number; remaining: number }>(`${base}/verify`, { method: "POST" });
                    setWaiting("");
                    setDraft(data.draft);
                    if (!data.checked || !data.remaining) break;
                    failures = 0;
                    waits = 0;
                } catch (caught) {
                    const code = caught instanceof ApiError ? String(caught.body.code ?? "") : "";
                    if (WAIT_MS[code] && waits < MAX_WAITS_IN_A_ROW) {
                        waits += 1;
                        setWaiting(`${errorText(caught)} Waiting ${WAIT_MS[code] / 1000} seconds, then continuing...`);
                        await sleep(WAIT_MS[code]);
                        continue;
                    }
                    failures += 1;
                    if (!RETRYABLE.has(code) || failures >= MAX_TRIES) {
                        setError(describeFailure(caught));
                        break;
                    }
                    await sleep(1_500);
                }
            }
        } finally {
            setWaiting("");
            setPhase("idle");
        }
    }, [base]);

    /** Runs the plan one step per request, retrying rejected replies with the reasons attached. */
    const generate = useCallback(async (start: GenerationDraft) => {
        stopRef.current = false;
        setError("");
        setPhase("generating");
        let current = start;
        const tries = new Map<string, number>();
        let waits = 0;
        let limitWaits = 0;
        try {
            while (!stopRef.current) {
                const step = current.steps.find((item) => item.status !== "done");
                if (!step) break;
                try {
                    const data = await adminApi<{ draft: GenerationDraft }>(`${base}/generate`, jsonInit("POST", { stepId: step.id }));
                    setWaiting("");
                    limitWaits = 0;
                    current = data.draft;
                    setDraft(current);
                } catch (caught) {
                    const body = caught instanceof ApiError ? caught.body : {};
                    if (body.draft) {
                        current = body.draft as GenerationDraft;
                        setDraft(current);
                    }
                    // Another tab is running this step: wait for it instead of failing.
                    if (caught instanceof ApiError && caught.status === 409 && current.status === "generating" && waits < 36) {
                        waits += 1;
                        await sleep(10_000);
                        current = await load();
                        continue;
                    }
                    const code = String(body.code ?? "");
                    if (WAIT_MS[code] && limitWaits < MAX_WAITS_IN_A_ROW) {
                        limitWaits += 1;
                        setWaiting(`${errorText(caught)} Waiting ${WAIT_MS[code] / 1000} seconds, then continuing...`);
                        await sleep(WAIT_MS[code]);
                        continue;
                    }
                    const count = (tries.get(step.id) ?? 0) + 1;
                    tries.set(step.id, count);
                    if (RETRYABLE.has(code) && count < MAX_TRIES) {
                        await sleep(1_000);
                        continue;
                    }
                    setError(describeFailure(caught));
                    return;
                }
            }
            setWaiting("");
            if (!stopRef.current && current.steps.every((item) => item.status === "done")) await check();
        } finally {
            setWaiting("");
            setPhase("idle");
        }
    }, [base, check, load]);

    useEffect(() => {
        let cancelled = false;
        load()
            .then((loaded) => {
                if (cancelled || !autoRun || startedRef.current || loaded.status !== "generating") return;
                startedRef.current = true;
                void generate(loaded);
            })
            .catch((caught) => setError(errorText(caught)));
        // Leaving the screen stops the loop after the request in flight.
        return () => {
            cancelled = true;
            stopRef.current = true;
        };
    }, [autoRun, generate, load]);

    async function edit(body: Record<string, unknown>): Promise<boolean> {
        try {
            const data = await adminApi<{ draft: GenerationDraft; addedKey: string | null }>(base, jsonInit("PATCH", body));
            setDraft(data.draft);
            if (data.addedKey) setNewKey(data.addedKey);
            setError("");
            return true;
        } catch (caught) {
            setError(errorText(caught));
            return false;
        }
    }

    const setEditorOpen = useCallback((key: string, open: boolean) => {
        setOpenEditors((current) => {
            const next = new Set(current);
            if (open) next.add(key); else next.delete(key);
            return next;
        });
    }, []);

    async function approve() {
        if (!draft) return;
        if (!window.confirm(`Push ${draft.questions.length} questions to the live question bank? Students will start seeing them.`)) return;
        setPhase("approving");
        setError("");
        try {
            const data = await adminApi<{ questionIds: string[]; microTag: string | null }>(`${base}/approve`, jsonInit("POST", { replaceLesson }));
            await load();
            setNotice(`Done. ${data.questionIds.length} questions are now live${data.microTag ? ` under the new micro-topic ${data.microTag}` : ""}.`);
            onPublished();
        } catch (caught) {
            setError(errorText(caught));
        } finally {
            setPhase("idle");
        }
    }

    async function discard() {
        if (!window.confirm("Discard this draft? Nothing in it has gone live, and it cannot be reopened.")) return;
        try {
            await adminApi(base, { method: "DELETE" });
            onClose();
        } catch (caught) {
            setError(errorText(caught));
        }
    }

    if (!draft) {
        return (
            <section className="space-y-3 bg-white p-4">
                <Button variant="outline" size="sm" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" />Back to AI Studio</Button>
                {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">Loading draft...</p>}
            </section>
        );
    }

    const live = draft.status === "approved";
    const busy = phase !== "idle";
    const labels = stepLabels(draft.steps);
    const pendingSteps = draft.steps.filter((step) => step.status !== "done");
    const failedStep = draft.steps.find((step) => step.status === "failed");
    const checkable = draft.questions.filter((question) => question.verification.status === "pending" && question.questionText.trim() && question.options.every((option) => option.trim()));
    const checked = draft.questions.filter(isChecked).length;
    const disagreements = draft.questions.filter((question) => question.verification.status === "disagrees").length;
    const topicTitles = new Map(draft.target.microTopics.map((topic) => [topic.microTag, topic.microTag === NEW_MICRO_TAG ? `${topic.title} (new)` : topic.title]));
    const conceptIssues = issuesByKey.get("concept") ?? [];
    const draftIssues = issuesByKey.get("draft") ?? [];
    const canApprove = draft.status === "needs_review" && !blocking.length && !busy && !openEditors.size;
    const countFor = (difficulty: Difficulty) => draft.questions.filter((question) => question.difficulty === difficulty).length;

    const ordered = DIFFICULTIES.flatMap((difficulty) => draft.questions
        .filter((question) => question.difficulty === difficulty)
        .map((question, index) => ({ question, number: index + 1 })));
    const visible = ordered.filter(({ question }) =>
        filter === "all" ? true
            : filter === "problems" ? (issuesByKey.get(question.key) ?? []).some((issue) => issue.severity === "error")
                : question.difficulty === filter);
    const withProblems = ordered.filter(({ question }) => (issuesByKey.get(question.key) ?? []).length).length;

    return (
        <div className="space-y-4">
            <section className="space-y-3 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <Button variant="outline" size="sm" onClick={onClose}><ArrowLeft className="mr-2 h-4 w-4" />Back to AI Studio</Button>
                    {!live ? <Button variant="ghost" size="sm" className="text-destructive" onClick={discard} disabled={busy}><Trash2 className="mr-2 h-4 w-4" />Discard draft</Button> : null}
                </div>
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{draft.target.microTopic?.title ?? draft.target.subTopic ?? draft.target.chapter.title}</h2>
                        <Badge variant="outline">{LEVEL_LABELS[draft.level]}</Badge>
                        <Badge variant={live ? "default" : "secondary"}>{live ? "Live" : draft.status === "needs_review" ? "Ready for review" : "Generating"}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                        {draft.curriculum} · Class {draft.target.classLevel} · {draft.target.chapter.title}
                        {draft.target.subTopic ? ` › ${draft.target.subTopic}` : ""}
                        {draft.target.microTopic && draft.level === "micro" ? ` › ${draft.target.microTopic.title}` : ""}
                    </p>
                    {draft.level !== "micro" ? (
                        <p className="mt-1 text-xs text-muted-foreground">Questions are filed under: {draft.target.microTopics.map((topic) => topic.title).join(", ")}</p>
                    ) : null}
                </div>
                {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                {notice ? <Alert className="border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}
                {waiting ? <Alert className="border-amber-300 bg-amber-50"><Loader2 className="h-4 w-4 animate-spin" /><AlertDescription>{waiting}</AlertDescription></Alert> : null}
                {live ? <Alert className="border-emerald-300 bg-emerald-50"><ShieldCheck className="h-4 w-4" /><AlertDescription>This pool is live in the question bank. It can no longer be edited here; use the Questions tab for changes.</AlertDescription></Alert> : null}
            </section>

            {!live && (pendingSteps.length || draft.status === "generating") ? (
                <section className="space-y-3 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="font-semibold">Generating</h3>
                            <p className="text-xs text-muted-foreground">
                                {draft.questions.length} of {draft.quota.easy + draft.quota.medium + draft.quota.hard} questions written. Each step is one AI request for a small batch of questions; a reply that breaks a rule is rejected and written again.
                            </p>
                        </div>
                        {phase === "generating"
                            ? <Button variant="outline" onClick={() => { stopRef.current = true; }}><Pause className="mr-2 h-4 w-4" />Pause after this step</Button>
                            : <Button onClick={() => generate(draft)} disabled={busy}><Play className="mr-2 h-4 w-4" />{draft.steps.some((step) => step.attempts) ? "Continue generating" : "Start generating"}</Button>}
                    </div>
                    <ol className="grid gap-1 text-sm md:grid-cols-2">
                        {draft.steps.map((step) => (
                            <li key={step.id} className="flex items-start gap-2">
                                {step.status === "done" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                    : step.status === "running" ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-600" />
                                        : step.status === "failed" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                            : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />}
                                <span>
                                    {labels.get(step.id)}
                                    {step.attempts > 1 ? <span className="text-xs text-muted-foreground"> · {step.attempts} attempts</span> : null}
                                    {step.error && step.status !== "running" ? <span className="block text-xs text-muted-foreground">{step.error}</span> : null}
                                </span>
                            </li>
                        ))}
                    </ol>
                    {failedStep && phase === "idle" ? (
                        <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                            <p><strong>{labels.get(failedStep.id)}</strong> did not pass the checks.</p>
                            {failedStep.feedback?.length ? (
                                <ul className="list-disc pl-5 text-xs">{failedStep.feedback.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" onClick={() => generate(draft)}><RotateCcw className="mr-2 h-4 w-4" />Try again</Button>
                                <Button size="sm" variant="outline" onClick={() => edit({ op: "skipStep", stepId: failedStep.id })}><SkipForward className="mr-2 h-4 w-4" />Skip and write these by hand</Button>
                            </div>
                        </div>
                    ) : null}
                </section>
            ) : null}

            <ConceptCard
                concept={draft.concept}
                level={draft.level}
                issues={conceptIssues}
                readOnly={live}
                onSave={(concept) => edit({ op: "concept", concept })}
                onOpenChange={(open) => setEditorOpen("concept", open)}
            />

            <section className="space-y-3 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="font-semibold">Question pool</h3>
                        <p className="text-xs text-muted-foreground">
                            {DIFFICULTIES.map((difficulty) => `${capital(difficulty)} ${countFor(difficulty)}/${draft.quota[difficulty]}`).join(" · ")}
                            {" · "}Answers checked {checked}/{draft.questions.length}
                            {disagreements ? ` · ${disagreements} disagreement(s)` : ""}
                        </p>
                    </div>
                    {!live ? (
                        <Button variant="outline" onClick={check} disabled={busy || !checkable.length}>
                            {phase === "checking" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                            {phase === "checking" ? "Checking answers..." : `Check answers${checkable.length ? ` (${checkable.length})` : ""}`}
                        </Button>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {(["all", "easy", "medium", "hard", "problems"] as const).map((value) => (
                        <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
                            {value === "all" ? `All (${ordered.length})` : value === "problems" ? `With problems (${withProblems})` : `${capital(value)} (${countFor(value)})`}
                        </Button>
                    ))}
                    <label className="ml-auto flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={showDetails} onChange={(event) => setShowDetails(event.target.checked)} />
                        Show hints, solutions and reasons
                    </label>
                </div>
                {!live ? (
                    <div className="flex flex-wrap gap-2">
                        {DIFFICULTIES.map((difficulty) => (
                            <Button key={difficulty} size="sm" variant="outline" disabled={busy} onClick={() => edit({ op: "add", difficulty })}>
                                <Plus className="mr-1 h-4 w-4" />Add {difficulty} question
                            </Button>
                        ))}
                    </div>
                ) : null}
            </section>

            <div className="space-y-3">
                {visible.map(({ question, number }) => (
                    <QuestionCard
                        key={question.key}
                        question={question}
                        number={number}
                        topicTitles={topicTitles}
                        issues={issuesByKey.get(question.key) ?? []}
                        readOnly={live}
                        showDetails={showDetails}
                        startEditing={question.key === newKey}
                        onEdit={edit}
                        onOpenChange={setEditorOpen}
                    />
                ))}
                {!visible.length ? <p className="bg-white p-4 text-sm text-muted-foreground">No questions to show.</p> : null}
            </div>

            {!live ? (
                <section className="sticky bottom-0 z-20 rounded-lg border-2 border-emerald-500 bg-white p-4 shadow-lg">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-1 text-sm">
                            <p className="font-semibold">Final check before going live</p>
                            <p className="flex items-center gap-1.5">
                                {draftIssues.length ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                                Counts: {DIFFICULTIES.map((difficulty) => `${capital(difficulty)} ${countFor(difficulty)}/${draft.quota[difficulty]}`).join(" · ")}
                            </p>
                            <p className="flex items-center gap-1.5">
                                {checked === draft.questions.length && draft.questions.length ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                                Answers checked: {checked}/{draft.questions.length}
                            </p>
                            <p className="flex items-center gap-1.5">
                                {blocking.length ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                                {blocking.length ? `${blocking.length} problem(s) left to fix` : "No problems left"}
                            </p>
                            {draft.level === "micro" && draft.target.microTopic?.microTag ? (
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={replaceLesson} onChange={(event) => setReplaceLesson(event.target.checked)} />
                                    Also use this explanation as the lesson for &ldquo;{draft.target.microTopic.title}&rdquo; (replaces its current lesson text)
                                </label>
                            ) : null}
                            {draft.level === "micro" && !draft.target.microTopic?.microTag ? (
                                <p className="text-muted-foreground">A new micro-topic &ldquo;{draft.target.microTopic?.title}&rdquo; will be created in &ldquo;{draft.target.chapter.title}&rdquo;, with this explanation as its lesson.</p>
                            ) : null}
                            {draft.level === "sub" ? (
                                <p className="text-muted-foreground">The chosen micro-topics will be grouped under the sub-topic &ldquo;{draft.target.subTopic}&rdquo;.</p>
                            ) : null}
                            {draft.status === "generating" ? <p className="text-muted-foreground">Finish every generation step first.</p> : null}
                            {openEditors.size ? <p className="text-amber-700">Save or cancel the open edits first.</p> : null}
                        </div>
                        <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={!canApprove} onClick={approve}>
                            {phase === "approving" ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Rocket className="mr-2 h-5 w-5" />}
                            Approve &amp; Push to Live Database
                        </Button>
                    </div>
                </section>
            ) : null}
        </div>
    );
}

const EMPTY_CONCEPT: DraftConcept = { title: "", example: { english: "", romanUrdu: "" }, explanation: { english: "", romanUrdu: "" } };

function ConceptCard({ concept, level, issues, readOnly, onSave, onOpenChange }: {
    concept: DraftConcept | null;
    level: GenerationDraft["level"];
    issues: DraftIssue[];
    readOnly: boolean;
    onSave: (concept: DraftConcept) => Promise<boolean>;
    onOpenChange: (open: boolean) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState<DraftConcept>(concept ?? EMPTY_CONCEPT);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!editing) setForm(concept ?? EMPTY_CONCEPT);
    }, [concept, editing]);

    const open = (value: boolean) => {
        setEditing(value);
        onOpenChange(value);
    };

    async function save() {
        setSaving(true);
        const saved = await onSave(form);
        setSaving(false);
        if (saved) open(false);
    }

    return (
        <section className="space-y-3 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold">Concept explanation</h3>
                    <p className="text-xs text-muted-foreground">
                        {level === "micro" ? "Shown to students as the lesson for this micro-topic." : "Kept with this pool as its summary."}
                    </p>
                </div>
                {!readOnly && !editing ? <Button size="sm" variant="outline" onClick={() => open(true)}><Pencil className="mr-2 h-4 w-4" />{concept ? "Edit" : "Write it"}</Button> : null}
            </div>
            {editing ? (
                <div className="space-y-3">
                    <TextField label="Title" value={form.title} onChange={(title) => setForm({ ...form, title })} />
                    <PairEditor label="Explanation" value={form.explanation} rows={5} onChange={(explanation) => setForm({ ...form, explanation })} />
                    <PairEditor label="Real-life local example" value={form.example} rows={3} onChange={(example) => setForm({ ...form, example })} />
                    <div className="flex gap-2">
                        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save explanation"}</Button>
                        <Button variant="outline" onClick={() => open(false)}>Cancel</Button>
                    </div>
                </div>
            ) : concept ? (
                <div className="space-y-3">
                    <p className="text-base font-semibold">{concept.title}</p>
                    <PairView label="Explanation" text={concept.explanation} />
                    <PairView label="Local example" text={concept.example} />
                </div>
            ) : <p className="text-sm text-muted-foreground">Not written yet.</p>}
            <IssueList issues={issues} />
        </section>
    );
}

function VerificationBadge({ question }: { question: DraftQuestion }) {
    const { status, aiAnswer } = question.verification;
    if (status === "agrees") return <Badge className="bg-emerald-600">AI check agrees</Badge>;
    if (status === "confirmed") return <Badge className="bg-sky-600">Checked by you</Badge>;
    if (status === "disagrees") return <Badge variant="destructive">{aiAnswer ? `AI check chose ${aiAnswer}` : "AI check: no option is right"}</Badge>;
    if (status === "error") return <Badge className="bg-amber-500">Check failed</Badge>;
    return <Badge variant="outline">Not checked yet</Badge>;
}

function QuestionCard({ question, number, topicTitles, issues, readOnly, showDetails, startEditing, onEdit, onOpenChange }: {
    question: DraftQuestion;
    number: number;
    topicTitles: Map<string, string>;
    issues: DraftIssue[];
    readOnly: boolean;
    showDetails: boolean;
    startEditing: boolean;
    onEdit: (body: Record<string, unknown>) => Promise<boolean>;
    onOpenChange: (key: string, open: boolean) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState<DraftQuestion>(question);
    const [saving, setSaving] = useState(false);
    const radioName = useId();

    const open = useCallback((value: boolean) => {
        setEditing(value);
        onOpenChange(question.key, value);
    }, [onOpenChange, question.key]);

    useEffect(() => {
        if (startEditing) open(true);
    }, [startEditing, open]);

    useEffect(() => {
        if (!editing) setForm(question);
    }, [question, editing]);

    async function run(body: Record<string, unknown>) {
        setSaving(true);
        const done = await onEdit(body);
        setSaving(false);
        return done;
    }

    async function save() {
        const wrongReasons: DraftQuestion["wrongReasons"] = {};
        for (const letter of OPTION_LETTERS) {
            if (letter === form.correctOption) continue;
            wrongReasons[letter] = form.wrongReasons[letter] ?? { english: "", romanUrdu: "", misconceptionTag: "arithmetic-slip" };
        }
        const { key, difficulty, microTag, questionText, options, correctOption, hint, solution } = form;
        if (await run({ op: "question", question: { key, difficulty, microTag, questionText, options, correctOption, hint, solution, wrongReasons } })) open(false);
    }

    const setReason = (letter: OptionLetter, patch: Partial<{ english: string; romanUrdu: string; misconceptionTag: MisconceptionTag }>) =>
        setForm((current) => ({
            ...current,
            wrongReasons: {
                ...current.wrongReasons,
                [letter]: { english: "", romanUrdu: "", misconceptionTag: "arithmetic-slip" as MisconceptionTag, ...current.wrongReasons[letter], ...patch },
            },
        }));

    const errors = issues.filter((issue) => issue.severity === "error");
    const { verification } = question;

    return (
        <article className={`space-y-3 rounded-lg border bg-white p-4 ${errors.length ? "border-amber-300" : ""}`}>
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{capital(question.difficulty)} #{number}</span>
                    {topicTitles.size > 1 ? <Badge variant="outline">{topicTitles.get(question.microTag) ?? "No micro-topic"}</Badge> : null}
                    <VerificationBadge question={question} />
                    {question.origin === "manual" ? <Badge variant="secondary">Written by hand</Badge> : null}
                </div>
                {!readOnly && !editing ? (
                    <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => open(true)}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={saving}
                            onClick={() => window.confirm("Remove this question from the draft?") && run({ op: "remove", key: question.key })}>
                            <Trash2 className="mr-1 h-4 w-4" />Remove
                        </Button>
                    </div>
                ) : null}
            </header>

            {editing ? (
                <div className="space-y-4">
                    <TextArea label="Question" value={form.questionText} rows={3} onChange={(questionText) => setForm({ ...form, questionText })} />
                    <div className="grid gap-2 md:grid-cols-2">
                        {OPTION_LETTERS.map((letter, index) => (
                            <div key={letter} className={`space-y-1 rounded-md border p-2 ${form.correctOption === letter ? "border-emerald-400 bg-emerald-50/60" : ""}`}>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-semibold">Option {letter}</span>
                                    <label className="flex items-center gap-1.5 text-xs">
                                        <input type="radio" name={radioName} checked={form.correctOption === letter} onChange={() => setForm({ ...form, correctOption: letter })} />
                                        Correct answer
                                    </label>
                                </div>
                                <Input aria-label={`Option ${letter}`} value={form.options[index] ?? ""}
                                    onChange={(event) => setForm({ ...form, options: form.options.map((option, position) => (position === index ? event.target.value : option)) })} />
                            </div>
                        ))}
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        <NativeSelect label="Difficulty" value={form.difficulty}
                            options={DIFFICULTIES.map((difficulty) => [difficulty, capital(difficulty)])}
                            onChange={(difficulty) => setForm({ ...form, difficulty: difficulty as Difficulty })} />
                        {topicTitles.size > 1 ? (
                            <NativeSelect label="Micro-topic" value={form.microTag}
                                options={[...topicTitles.entries()]}
                                onChange={(microTag) => setForm({ ...form, microTag })} />
                        ) : null}
                    </div>
                    <PairEditor label="Hint" value={form.hint} rows={2} onChange={(hint) => setForm({ ...form, hint })} />
                    <PairEditor label="Step-by-step solution" value={form.solution} rows={5} onChange={(solution) => setForm({ ...form, solution })} />
                    <div className="grid gap-3 lg:grid-cols-3">
                        {OPTION_LETTERS.filter((letter) => letter !== form.correctOption).map((letter) => {
                            const reason = form.wrongReasons[letter];
                            return (
                                <div key={letter} className="space-y-2 rounded-md border border-rose-200 bg-rose-50/40 p-2">
                                    <p className="text-sm font-semibold">Why option {letter} is wrong{form.options[OPTION_LETTERS.indexOf(letter)] ? `: ${form.options[OPTION_LETTERS.indexOf(letter)]}` : ""}</p>
                                    <TextArea label="English" value={reason?.english ?? ""} rows={2} onChange={(english) => setReason(letter, { english })} />
                                    <TextArea label="Roman Urdu" value={reason?.romanUrdu ?? ""} rows={2} onChange={(romanUrdu) => setReason(letter, { romanUrdu })} />
                                    <NativeSelect label="Misconception" value={reason?.misconceptionTag ?? "arithmetic-slip"}
                                        options={MISCONCEPTION_TAGS.map((tag) => [tag, MISCONCEPTIONS[tag].label.english])}
                                        onChange={(tag) => setReason(letter, { misconceptionTag: tag as MisconceptionTag })} />
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-xs text-muted-foreground">Changing the question, the options or the correct answer sends it for a new answer check.</p>
                    <div className="flex gap-2">
                        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save question"}</Button>
                        <Button variant="outline" onClick={() => { setForm(question); open(false); }}>Cancel</Button>
                    </div>
                </div>
            ) : (
                <>
                    <p className="whitespace-pre-line font-medium">{question.questionText || <em className="text-muted-foreground">No question text yet.</em>}</p>
                    <ol className="grid gap-2 sm:grid-cols-2">
                        {OPTION_LETTERS.map((letter, index) => (
                            <li key={letter} className={`rounded-md border px-3 py-2 text-sm ${question.correctOption === letter ? "border-emerald-500 bg-emerald-50 font-medium" : ""}`}>
                                <span className="font-semibold">{letter}.</span> {question.options[index] || <em className="text-muted-foreground">empty</em>}
                                {question.correctOption === letter ? <span className="ml-2 text-xs text-emerald-700">Correct</span> : null}
                            </li>
                        ))}
                    </ol>
                    {showDetails ? (
                        <div className="space-y-3 border-t pt-3">
                            <PairView label="Hint" text={question.hint} />
                            <PairView label="Step-by-step solution" text={question.solution} />
                            {OPTION_LETTERS.filter((letter) => letter !== question.correctOption).map((letter) => {
                                const reason = question.wrongReasons[letter];
                                return (
                                    <PairView key={letter}
                                        label={`Why ${letter} is wrong${reason ? ` · ${MISCONCEPTIONS[reason.misconceptionTag]?.label.english ?? reason.misconceptionTag}` : ""}`}
                                        text={{ english: reason?.english ?? "", romanUrdu: reason?.romanUrdu ?? "" }} />
                                );
                            })}
                        </div>
                    ) : null}
                </>
            )}

            {!editing && (verification.status === "disagrees" || verification.status === "error") ? (
                <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                    {verification.status === "disagrees" ? (
                        <p>
                            {verification.aiAnswer
                                ? <>An independent AI solve chose <strong>{verification.aiAnswer}</strong>, but <strong>{question.correctOption}</strong> is marked correct.</>
                                : <>An independent AI solve found <strong>no option</strong> that equals the right answer, or two options that are the same.</>}
                            {" "}Work it out yourself.
                            {verification.note ? <span className="block text-xs text-muted-foreground">Its working: {verification.note}</span> : null}
                        </p>
                    ) : <p>The answer check failed: {verification.note ?? "no reply"}.</p>}
                    {!readOnly ? (
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => run({ op: "confirm", key: question.key })}>
                                <CheckCircle2 className="mr-1 h-4 w-4" />I checked: {question.correctOption} is correct
                            </Button>
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => run({ op: "recheck", key: question.key })}>
                                <RotateCcw className="mr-1 h-4 w-4" />Check again
                            </Button>
                        </div>
                    ) : null}
                </div>
            ) : null}
            {!editing && !readOnly && verification.status === "pending" && question.origin === "manual" && question.questionText.trim() ? (
                <Button size="sm" variant="outline" disabled={saving} onClick={() => run({ op: "confirm", key: question.key })}>
                    <CheckCircle2 className="mr-1 h-4 w-4" />I checked: {question.correctOption} is correct
                </Button>
            ) : null}
            <IssueList issues={issues} />
        </article>
    );
}

function IssueList({ issues }: { issues: DraftIssue[] }) {
    if (!issues.length) return null;
    return (
        <ul className="space-y-1 text-sm">
            {issues.map((issue) => (
                <li key={issue.message} className={`flex items-start gap-1.5 ${issue.severity === "error" ? "text-amber-800" : "text-muted-foreground"}`}>
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{issue.message}
                </li>
            ))}
        </ul>
    );
}

function PairView({ label, text }: { label: string; text: LocalizedText }) {
    return (
        <div className="grid gap-2 md:grid-cols-2">
            <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label} · English</p>
                <p className="whitespace-pre-line text-sm">{text.english || <em className="text-muted-foreground">missing</em>}</p>
            </div>
            <div lang="ur-Latn" className="rounded-md bg-slate-50 p-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label} · Roman Urdu</p>
                <p className="whitespace-pre-line text-sm">{text.romanUrdu || <em className="text-muted-foreground">missing</em>}</p>
            </div>
        </div>
    );
}

function PairEditor({ label, value, rows, onChange }: { label: string; value: LocalizedText; rows: number; onChange: (value: LocalizedText) => void }) {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <TextArea label={`${label} (English)`} value={value.english} rows={rows} onChange={(english) => onChange({ ...value, english })} />
            <TextArea label={`${label} (Roman Urdu)`} value={value.romanUrdu} rows={rows} onChange={(romanUrdu) => onChange({ ...value, romanUrdu })} />
        </div>
    );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const id = useId();
    return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function TextArea({ label, value, rows, onChange }: { label: string; value: string; rows: number; onChange: (value: string) => void }) {
    const id = useId();
    return (
        <div className="space-y-1">
            <Label htmlFor={id}>{label}</Label>
            <textarea
                id={id}
                rows={rows}
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}

export function NativeSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]> | string[][]; onChange: (value: string) => void }) {
    const id = useId();
    return (
        <div className="space-y-1">
            <Label htmlFor={id}>{label}</Label>
            <select id={id} value={value} onChange={(event) => onChange(event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                {options.map(([optionValue, title]) => <option key={optionValue} value={optionValue}>{title}</option>)}
            </select>
        </div>
    );
}

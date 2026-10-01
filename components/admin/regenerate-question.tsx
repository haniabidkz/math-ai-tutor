"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminApi, jsonInit } from "@/lib/admin-api";
import { REWRITE_REASON_KEYS, REWRITE_REASONS, type DraftQuestion, type RewriteReason } from "@/lib/ai-studio/types";
import type { QuestionBankItem } from "@/types/curriculum";

interface Candidate {
    candidate: QuestionBankItem;
    passed: boolean;
    verification: DraftQuestion["verification"];
}

const errorText = (caught: unknown) => (caught instanceof Error ? caught.message : "Something went wrong");

/**
 * Regenerate for a live question: the AI writes a corrected version for the same micro-topic
 * and difficulty, a second AI solves it again, and the admin replaces the question in one click.
 */
export function RegenerateQuestionDialog({ question, onClose, onReplaced }: {
    question: QuestionBankItem;
    onClose: () => void;
    /** Called after the live question was replaced. */
    onReplaced: () => void;
}) {
    const [reason, setReason] = useState<RewriteReason>("flawed");
    const [note, setNote] = useState("");
    const [phase, setPhase] = useState<"choose" | "writing" | "review" | "saving">("choose");
    const [result, setResult] = useState<Candidate | null>(null);
    const [error, setError] = useState("");
    const base = `/api/admin/questions/${encodeURIComponent(question.id)}/regenerate`;
    const working = phase === "writing" || phase === "saving";

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !working) onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, working]);

    async function generate() {
        setPhase("writing");
        setError("");
        try {
            const data = await adminApi<Candidate>(base, jsonInit("POST", { reason, ...(note.trim() ? { note: note.trim() } : {}) }));
            setResult({ candidate: data.candidate, passed: data.passed, verification: data.verification });
            setPhase("review");
        } catch (caught) {
            setError(errorText(caught));
            setPhase(result ? "review" : "choose");
        }
    }

    async function replace() {
        setPhase("saving");
        setError("");
        try {
            await adminApi(base, { method: "PUT" });
            onReplaced();
        } catch (caught) {
            setError(errorText(caught));
            setPhase("review");
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="regenerate-title">
            <div className="my-8 w-full max-w-3xl space-y-4 rounded-lg bg-white p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h2 id="regenerate-title" className="text-lg font-semibold">Regenerate question</h2>
                        <p className="text-xs text-muted-foreground">{question.id} · {question.microTag} · Class {question.classLevel} · {question.difficulty}</p>
                    </div>
                    <Button size="icon" variant="ghost" aria-label="Close" disabled={working} onClick={onClose}><X className="h-4 w-4" /></Button>
                </div>

                <QuestionPreview title="Current question" item={question} />

                {phase === "choose" || phase === "writing" ? (
                    <div className="space-y-3 rounded-md border border-sky-300 bg-sky-50 p-3 text-sm">
                        <p className="font-medium">What is wrong with it? The AI writes a corrected question for the same micro-topic and difficulty.</p>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Reason">
                            {REWRITE_REASON_KEYS.map((key) => (
                                <Button key={key} size="sm" role="radio" aria-checked={reason === key} disabled={working}
                                    variant={reason === key ? "default" : "outline"} onClick={() => setReason(key)}>
                                    {REWRITE_REASONS[key].label}
                                </Button>
                            ))}
                        </div>
                        <Input aria-label="Note for the AI" placeholder="Optional note for the AI, e.g. the answer should be 12" maxLength={300}
                            value={note} disabled={working} onChange={(event) => setNote(event.target.value)} />
                    </div>
                ) : null}

                {phase === "writing" ? (
                    <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Writing a new version and checking its answer. This takes about 30 to 90 seconds.</p>
                ) : null}

                {result && (phase === "review" || phase === "saving") ? (
                    <div className="space-y-2">
                        <QuestionPreview title="New version" item={result.candidate} details />
                        {result.passed ? (
                            <p className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-800">
                                <CheckCircle2 className="h-4 w-4" />An independent AI solve agrees with the marked answer, and the question stays inside its micro-topic.
                            </p>
                        ) : (
                            <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    The answer check is not happy with this version
                                    {result.verification.status === "disagrees" ? (result.verification.aiAnswer ? ` (it chose ${result.verification.aiAnswer})` : " (no option equals its answer)") : ""}
                                    {result.verification.onTopic === false ? `, and it says the question leaves its micro-topic${result.verification.topicNote ? `: ${result.verification.topicNote}` : ""}` : ""}.
                                    {" "}It cannot replace the question. Try again.
                                </span>
                            </p>
                        )}
                    </div>
                ) : null}

                {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}

                <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                    <Button variant="outline" disabled={working} onClick={onClose}>Cancel</Button>
                    {phase === "choose" || phase === "writing" ? (
                        <Button disabled={working} onClick={generate}>
                            {phase === "writing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Regenerate
                        </Button>
                    ) : (
                        <>
                            <Button variant="outline" disabled={working} onClick={() => { setResult(null); setPhase("choose"); }}>
                                <RefreshCw className="mr-2 h-4 w-4" />Try again
                            </Button>
                            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={working || !result?.passed} onClick={replace}>
                                {phase === "saving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Replace question
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function QuestionPreview({ title, item, details = false }: { title: string; item: QuestionBankItem; details?: boolean }) {
    return (
        <section className="space-y-2 rounded-md border p-3">
            <div className="flex items-center gap-2"><Badge variant="outline">{title}</Badge></div>
            <p className="font-medium">{item.question.english}</p>
            <ol className="grid gap-2 sm:grid-cols-2">
                {item.options.map((option) => (
                    <li key={option.id} className={`rounded-md border px-3 py-2 text-sm ${option.id === item.correctOptionId ? "border-emerald-500 bg-emerald-50 font-medium" : ""}`}>
                        <span className="font-semibold">{option.id}.</span> {option.english}
                        {option.id === item.correctOptionId ? <span className="ml-2 text-xs text-emerald-700">Correct</span> : null}
                    </li>
                ))}
            </ol>
            {details ? (
                <div className="space-y-1 border-t pt-2 text-sm">
                    <p><span className="font-semibold">Hint:</span> {item.hint.english}</p>
                    <p className="text-muted-foreground">{item.hint.romanUrdu}</p>
                    <p className="whitespace-pre-line"><span className="font-semibold">Solution:</span> {item.explanation.english}</p>
                    <p className="whitespace-pre-line text-muted-foreground">{item.explanation.romanUrdu}</p>
                </div>
            ) : null}
        </section>
    );
}

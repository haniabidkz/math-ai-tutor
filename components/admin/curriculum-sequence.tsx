"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ListOrdered, Loader2, Sparkles } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminApi, jsonInit } from "@/lib/admin-api";
import { classOutline, type SequencedChapter } from "@/lib/curriculum-order";
import type { MicroConcept } from "@/types/curriculum";

interface SequenceReply { before: SequencedChapter[]; after: SequencedChapter[]; changed: string[]; notes: string; model: string; applied: boolean }

const CLASSES = [6, 7, 8] as const;

function Outline({ chapters, moved }: { chapters: SequencedChapter[]; moved?: Set<string> }) {
    if (!chapters.length) return <p className="text-sm text-muted-foreground">No lessons yet.</p>;
    return (
        <ol className="space-y-3">
            {chapters.map((chapter, index) => (
                <li key={chapter.topicId} className="rounded-md border bg-white p-3">
                    <p className="font-semibold">{index + 1}. {chapter.title} <span className="font-mono text-xs text-muted-foreground">{chapter.topicId}</span></p>
                    {chapter.subTopics.map((group, groupIndex) => (
                        <div key={`${chapter.topicId}-${groupIndex}`} className="mt-2 pl-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.name ?? "No sub-topic"}</p>
                            <ol className="mt-1 space-y-1">
                                {group.lessons.map((lesson) => (
                                    <li key={lesson.microTag} className={`flex flex-wrap items-center gap-2 text-sm ${moved?.has(lesson.microTag) ? "font-semibold text-indigo-800" : ""}`}>
                                        <span>{lesson.title}</span>
                                        <span className="font-mono text-[10px] text-muted-foreground">{lesson.microTag}</span>
                                        {lesson.unconfirmed ? <Badge variant="outline" className="border-amber-400 text-[10px] text-amber-800"><AlertTriangle className="mr-1 h-3 w-3" />Order unconfirmed</Badge> : null}
                                        {moved?.has(lesson.microTag) ? <Badge className="bg-indigo-100 text-[10px] text-indigo-800 hover:bg-indigo-100">moved</Badge> : null}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ))}
                </li>
            ))}
        </ol>
    );
}

/**
 * The curriculum as students meet it: chapters, sub-topics and lessons in textbook order,
 * with a one-click AI re-ordering per class that the Super Admin previews before applying.
 */
export function CurriculumSequence({ concepts, onApplied }: { concepts: MicroConcept[]; onApplied: () => void }) {
    const [classLevel, setClassLevel] = useState<6 | 7 | 8>(6);
    const [preview, setPreview] = useState<SequenceReply | null>(null);
    const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const current = useMemo(() => classOutline(concepts, classLevel), [concepts, classLevel]);
    const unconfirmed = useMemo(() => current.flatMap((chapter) => chapter.subTopics.flatMap((group) => group.lessons)).filter((lesson) => lesson.unconfirmed).length, [current]);

    async function run(apply: boolean) {
        setBusy(apply ? "apply" : "preview");
        setError("");
        setNotice("");
        try {
            const reply = await adminApi<SequenceReply>("/api/admin/concepts/sequence", jsonInit("POST", { classLevel, apply }));
            if (apply) {
                setPreview(null);
                setNotice(`Class ${classLevel} now follows the textbook order (${reply.changed.length} lesson${reply.changed.length === 1 ? "" : "s"} moved). ${reply.notes}`);
                onApplied();
            } else {
                setPreview(reply);
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The order could not be worked out");
        } finally {
            setBusy(null);
        }
    }

    return (
        <section className="space-y-4 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 font-semibold"><ListOrdered className="h-4 w-4" />Curriculum order</h2>
                    <p className="text-xs text-muted-foreground">What students see, in the order the textbook teaches it: chapters, then sub-topics, then lessons. New AI lessons are placed by the textbook on approval; use the button to re-order a whole class.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {CLASSES.map((level) => (
                        <Button key={level} size="sm" variant={classLevel === level ? "default" : "outline"} onClick={() => { setClassLevel(level); setPreview(null); }}>Class {level}</Button>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => run(false)} disabled={busy !== null || !current.length}>
                        {busy === "preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Order by textbook (AI)
                    </Button>
                </div>
            </div>
            {unconfirmed ? <Alert className="border-amber-300 bg-amber-50"><AlertTriangle className="h-4 w-4" /><AlertDescription>{unconfirmed} lesson{unconfirmed === 1 ? " was" : "s were"} placed at the end of {unconfirmed === 1 ? "its" : "their"} chapter because the textbook position could not be confirmed. Run "Order by textbook" or set the order by hand.</AlertDescription></Alert> : null}
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {notice ? <Alert className="border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}

            {preview ? (
                <div className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
                    <p className="text-sm"><strong>Proposed order</strong> from {preview.model}: {preview.changed.length} lesson{preview.changed.length === 1 ? "" : "s"} would move. {preview.notes}</p>
                    <div className="grid gap-4 lg:grid-cols-2">
                        <div><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Now</p><Outline chapters={preview.before} /></div>
                        <div><p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Textbook order</p><Outline chapters={preview.after} moved={new Set(preview.changed)} /></div>
                    </div>
                    <div className="flex gap-2">
                        <Button onClick={() => run(true)} disabled={busy !== null}>{busy === "apply" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Apply this order</Button>
                        <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
                    </div>
                </div>
            ) : <Outline chapters={current} />}
        </section>
    );
}

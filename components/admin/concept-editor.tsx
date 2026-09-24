"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Lock, Plus, Save, Upload, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    familyForTopic,
    suggestMicroTag,
    suggestTopicId,
    topicsForClass,
    visualForFamily,
    withRomanFallback,
} from "@/lib/concept-autofill";
import type { ConceptFamily, ContentStatus, MicroConcept } from "@/types/curriculum";

const NEW_TOPIC = "__new__";

const FAMILIES: Array<[ConceptFamily, string]> = [
    ["foundation", "Foundation"], ["integer", "Integer"], ["algebra", "Algebra"], ["equation", "Equation"], ["ratio", "Ratio"],
];
const VISUALS: Array<[MicroConcept["visualKind"], string]> = [
    ["number-line", "Number line"], ["fraction", "Fraction"], ["expression", "Expression"], ["balance", "Balance"], ["ratio", "Ratio"], ["pattern", "Pattern"],
];

export interface ConceptPayload extends Omit<MicroConcept, "imageUrl"> {
    imageUrl: string;
    /** Set for a brand-new concept so the server refuses to overwrite an existing one. */
    isNew: boolean;
}

interface ConceptForm {
    classLevel: number;
    topicChoice: string;
    newTopicEnglish: string;
    newTopicRomanUrdu: string;
    titleEnglish: string;
    titleRomanUrdu: string;
    summaryEnglish: string;
    summaryRomanUrdu: string;
    prerequisiteTag: string;
    family: ConceptFamily;
    visualKind: MicroConcept["visualKind"];
    order: number;
    imageUrl: string;
    status: ContentStatus;
    /** Fields the admin changed by hand stop following the automatic value. */
    manual: { prerequisite: boolean; family: boolean; visual: boolean; order: boolean };
}

const blank = (): ConceptForm => ({
    classLevel: 6, topicChoice: "", newTopicEnglish: "", newTopicRomanUrdu: "",
    titleEnglish: "", titleRomanUrdu: "", summaryEnglish: "", summaryRomanUrdu: "",
    prerequisiteTag: "", family: "algebra", visualKind: "expression", order: 0, imageUrl: "", status: "draft",
    manual: { prerequisite: false, family: false, visual: false, order: false },
});

function fromConcept(concept: MicroConcept): ConceptForm {
    return {
        classLevel: concept.classLevel,
        topicChoice: concept.topicId,
        newTopicEnglish: "", newTopicRomanUrdu: "",
        titleEnglish: concept.title.english,
        titleRomanUrdu: concept.title.romanUrdu === concept.title.english ? "" : concept.title.romanUrdu,
        summaryEnglish: concept.concept.english,
        summaryRomanUrdu: concept.concept.romanUrdu === concept.concept.english ? "" : concept.concept.romanUrdu,
        prerequisiteTag: concept.prerequisiteTag ?? "",
        family: concept.family,
        visualKind: concept.visualKind,
        order: concept.order,
        imageUrl: concept.imageUrl ?? "",
        status: concept.status,
        // An existing concept keeps everything as it was saved.
        manual: { prerequisite: true, family: true, visual: true, order: true },
    };
}

/**
 * Curriculum form where the admin types the title and summary; the micro tag, topic id,
 * family, visual, order and prerequisite are worked out and can still be overridden.
 */
export function ConceptEditor({
    concepts,
    editing,
    onSave,
    onUploadImage,
    onClear,
}: {
    concepts: MicroConcept[];
    editing: MicroConcept | null;
    onSave: (payload: ConceptPayload) => Promise<boolean>;
    onUploadImage: (file: File) => Promise<string | null>;
    onClear: () => void;
}) {
    const [form, setForm] = useState<ConceptForm>(() => (editing ? fromConcept(editing) : blank()));
    const [saving, setSaving] = useState(false);
    const isNew = !editing;

    const topics = useMemo(() => topicsForClass(concepts, form.classLevel), [concepts, form.classLevel]);
    const chosenTopic = topics.find((topic) => topic.topicId === form.topicChoice) ?? null;
    const creatingTopic = form.topicChoice === NEW_TOPIC;

    const topicId = creatingTopic
        ? suggestTopicId(form.classLevel, form.newTopicEnglish, topics.map((topic) => topic.topicId))
        : form.topicChoice;
    const microTag = editing
        ? editing.microTag
        : suggestMicroTag(form.classLevel, form.titleEnglish, concepts.map((concept) => concept.microTag));

    // A new class starts on its first topic.
    useEffect(() => {
        if (!isNew) return;
        setForm((current) => ({ ...current, topicChoice: topicsForClass(concepts, current.classLevel)[0]?.topicId ?? NEW_TOPIC }));
    }, [form.classLevel, concepts.length]);

    // Inherited values follow the chosen topic until the admin overrides them.
    useEffect(() => {
        if (!isNew) return;
        setForm((current) => {
            const family = chosenTopic?.family ?? familyForTopic(current.classLevel, current.newTopicEnglish);
            return {
                ...current,
                family: current.manual.family ? current.family : family,
                visualKind: current.manual.visual ? current.visualKind : chosenTopic?.visualKind ?? visualForFamily(family),
                order: current.manual.order ? current.order : chosenTopic?.nextOrder ?? 0,
                prerequisiteTag: current.manual.prerequisite ? current.prerequisiteTag : chosenTopic?.lastMicroTag ?? "",
            };
        });
    }, [form.topicChoice, form.newTopicEnglish, chosenTopic?.nextOrder]);

    const update = (patch: Partial<ConceptForm>) => setForm((current) => ({ ...current, ...patch }));
    const override = (field: keyof ConceptForm["manual"], patch: Partial<ConceptForm>) =>
        setForm((current) => ({ ...current, ...patch, manual: { ...current.manual, [field]: true } }));

    function resetAutomatic() {
        setForm((current) => {
            const family = chosenTopic?.family ?? familyForTopic(current.classLevel, current.newTopicEnglish);
            return {
                ...current,
                family,
                visualKind: chosenTopic?.visualKind ?? visualForFamily(family),
                order: chosenTopic?.nextOrder ?? 0,
                prerequisiteTag: chosenTopic?.lastMicroTag ?? "",
                manual: { prerequisite: false, family: false, visual: false, order: false },
            };
        });
    }

    const topicTitle = creatingTopic
        ? { english: form.newTopicEnglish, romanUrdu: form.newTopicRomanUrdu }
        : chosenTopic?.title ?? editing?.topicTitle ?? { english: "", romanUrdu: "" };

    const missing = [
        !microTag && "a title",
        !topicId && "a topic",
        !form.summaryEnglish.trim() && "a summary",
    ].filter(Boolean);

    async function submit() {
        if (missing.length) return;
        setSaving(true);
        try {
            const saved = await onSave({
                microTag,
                prerequisiteTag: form.prerequisiteTag || null,
                classLevel: form.classLevel as MicroConcept["classLevel"],
                topicId,
                topicTitle: withRomanFallback(topicTitle),
                title: withRomanFallback({ english: form.titleEnglish, romanUrdu: form.titleRomanUrdu }),
                concept: withRomanFallback({ english: form.summaryEnglish, romanUrdu: form.summaryRomanUrdu }),
                family: form.family,
                visualKind: form.visualKind,
                imageUrl: form.imageUrl,
                order: Number(form.order),
                // Class 5 concepts are foundations: used for diagnosis and repair, not taught as lessons.
                // An existing foundation of a later class keeps that role when edited.
                foundationOnly: form.classLevel === 5 || editing?.foundationOnly === true,
                status: form.status,
                isNew,
            });
            if (saved) setForm(blank());
        } finally {
            setSaving(false);
        }
    }

    const prerequisiteOptions = concepts.filter((concept) => concept.microTag !== microTag && concept.classLevel <= form.classLevel);
    const auto = (active: boolean) => (isNew && !active ? <Badge variant="outline" className="ml-2 text-[10px]">Auto</Badge> : null);

    return (
        <div className="space-y-6">
            <div className="rounded-md border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-900">
                {isNew
                    ? "Fill in the class, topic, title and summary. Everything marked Auto is worked out for you and can still be changed."
                    : "Editing an existing concept. Its micro tag is locked because questions and student progress are linked to it."}
            </div>

            <section className="grid gap-3 md:grid-cols-4">
                <SelectField label="Class" value={String(form.classLevel)} disabled={!isNew}
                    options={[["5", "Class 5 (foundation)"], ["6", "Class 6"], ["7", "Class 7"], ["8", "Class 8"]]}
                    onChange={(value) => update({ classLevel: Number(value), manual: { prerequisite: false, family: false, visual: false, order: false } })} />
                <div className="md:col-span-3">
                    <SelectField label="Topic" value={form.topicChoice}
                        options={[...topics.map((topic) => [topic.topicId, `${topic.title.english} (${topic.count} concepts)`]), [NEW_TOPIC, "+ New topic"]]}
                        onChange={(value) => update({ topicChoice: value })} />
                </div>
                {creatingTopic ? (
                    <>
                        <div className="md:col-span-2"><Field label="New topic name (English)" value={form.newTopicEnglish} onChange={(value) => update({ newTopicEnglish: value })} /></div>
                        <div className="md:col-span-2"><Field label="New topic name (Roman Urdu, optional)" value={form.newTopicRomanUrdu} onChange={(value) => update({ newTopicRomanUrdu: value })} /></div>
                    </>
                ) : null}
                <div className="md:col-span-2"><Field label="Title (English)" value={form.titleEnglish} onChange={(value) => update({ titleEnglish: value })} /></div>
                <div className="md:col-span-2"><Field label="Title (Roman Urdu, optional)" value={form.titleRomanUrdu} onChange={(value) => update({ titleRomanUrdu: value })} /></div>
                <div className="md:col-span-2"><TextArea label="Summary (English): the lesson students read" value={form.summaryEnglish} onChange={(value) => update({ summaryEnglish: value })} /></div>
                <div className="md:col-span-2"><TextArea label="Summary (Roman Urdu, optional)" value={form.summaryRomanUrdu} onChange={(value) => update({ summaryRomanUrdu: value })} /></div>
            </section>

            <section className="space-y-3 rounded-lg border bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Worked out for you</h3>
                    {isNew ? <Button type="button" variant="outline" size="sm" onClick={resetAutomatic}><Wand2 className="mr-2 h-4 w-4" />Reset to automatic</Button> : null}
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                    <ReadOnly label="Micro tag" value={microTag || "Type a title"} locked={!isNew} />
                    <ReadOnly label="Topic ID" value={topicId || (creatingTopic ? "Type a topic name" : "—")} locked={!isNew} />
                    <SelectField label="Prerequisite" badge={auto(form.manual.prerequisite)} value={form.prerequisiteTag || "none"}
                        options={[["none", "None"], ...prerequisiteOptions.map((concept) => [concept.microTag, `C${concept.classLevel} · ${concept.title.english}`])]}
                        onChange={(value) => override("prerequisite", { prerequisiteTag: value === "none" ? "" : value })} />
                    <Field label="Order in topic" badge={auto(form.manual.order)} type="number" value={String(form.order)}
                        onChange={(value) => override("order", { order: Math.max(0, Number(value) || 0) })} />
                    <SelectField label="Family" badge={auto(form.manual.family)} value={form.family} options={FAMILIES}
                        onChange={(value) => override("family", { family: value as ConceptFamily })} />
                    <SelectField label="Visual" badge={auto(form.manual.visual)} value={form.visualKind} options={VISUALS}
                        onChange={(value) => override("visual", { visualKind: value as MicroConcept["visualKind"] })} />
                    <SelectField label="Status" value={form.status}
                        options={[["draft", "Draft (hidden until published)"], ["published", "Published"], ["archived", "Archived"]]}
                        onChange={(value) => update({ status: value as ContentStatus })} />
                    <div className="space-y-1">
                        <Label>Image (optional)</Label>
                        <Label className="flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3 text-sm font-normal">
                            <Upload className="h-4 w-4" />{form.imageUrl ? "Replace image" : "Upload image"}
                            <Input type="file" accept="image/*" className="hidden" onChange={async (event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                const url = await onUploadImage(file);
                                if (url) update({ imageUrl: url });
                            }} />
                        </Label>
                    </div>
                </div>
            </section>

            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={submit} disabled={saving || missing.length > 0}><Save className="mr-2 h-4 w-4" />{isNew ? "Save concept" : "Update concept"}</Button>
                <Button variant="outline" onClick={() => { setForm(blank()); onClear(); }}><Plus className="mr-2 h-4 w-4" />New concept</Button>
                {missing.length ? <span className="text-xs text-muted-foreground">Still needed: {missing.join(", ")}.</span> : null}
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type = "text", badge }: { label: string; value: string; onChange: (value: string) => void; type?: string; badge?: React.ReactNode }) {
    const id = useId();
    return <div className="space-y-1"><Label htmlFor={id}>{label}{badge}</Label><Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} className="bg-white" /></div>;
}

function ReadOnly({ label, value, locked }: { label: string; value: string; locked: boolean }) {
    return (
        <div className="space-y-1">
            <Label>{label}<Badge variant="outline" className="ml-2 text-[10px]">{locked ? <><Lock className="mr-1 h-2.5 w-2.5" />Locked</> : "Auto"}</Badge></Label>
            <p className="flex h-9 items-center truncate rounded-md border bg-white px-3 font-mono text-xs text-slate-700">{value}</p>
        </div>
    );
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const id = useId();
    return (
        <div className="space-y-1">
            <Label htmlFor={id}>{label}</Label>
            <textarea
                id={id}
                className="min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}

function SelectField({ label, value, options, onChange, disabled = false, badge }: {
    label: string; value: string; options: Array<[string, string]> | string[][]; onChange: (value: string) => void; disabled?: boolean; badge?: React.ReactNode;
}) {
    const id = useId();
    return (
        <div className="space-y-1">
            <Label htmlFor={id}>{label}{badge}</Label>
            <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
                <SelectTrigger id={id} className="w-full bg-white"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>{options.map(([id, title]) => <SelectItem key={id} value={id}>{title}</SelectItem>)}</SelectContent>
            </Select>
        </div>
    );
}

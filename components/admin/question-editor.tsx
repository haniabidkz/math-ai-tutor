"use client";

import { useEffect, useId, useState } from "react";
import { Plus, Save, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    analysisForTag,
    MISCONCEPTION_TAGS,
    MISCONCEPTIONS,
    MISTAKE_TYPE_LABELS,
    MISTAKE_TYPES,
    suggestOptionAnalysis,
} from "@/lib/mistake-analysis";
import type {
    ContentStatus,
    Difficulty,
    LocalizedOption,
    MicroConcept,
    MisconceptionTag,
    MistakeType,
    QuestionBankItem,
} from "@/types/curriculum";

type OptionId = LocalizedOption["id"];
const OPTION_IDS: OptionId[] = ["A", "B", "C", "D"];

interface AnalysisForm {
    mistakeType: MistakeType;
    misconceptionTag: MisconceptionTag;
    whyWrongEnglish: string;
    whyWrongRomanUrdu: string;
    /** Still the system's suggestion; it refreshes when the options change until edited. */
    auto: boolean;
}

interface QuestionForm {
    id: string;
    microTag: string;
    classLevel: number;
    difficulty: Difficulty;
    status: ContentStatus;
    source: "sindh" | "oxford";
    version: number;
    questionEnglish: string;
    questionRomanUrdu: string;
    options: Record<OptionId, { english: string; romanUrdu: string }>;
    correctOptionId: OptionId;
    hintEnglish: string;
    hintRomanUrdu: string;
    explanationEnglish: string;
    explanationRomanUrdu: string;
    analysis: Partial<Record<OptionId, AnalysisForm>>;
}

export type QuestionPayload = Omit<QuestionBankItem, "id" | "prerequisiteTag"> & { id?: string; prerequisiteTag: string | null };

function blankForm(): QuestionForm {
    return {
        id: "", microTag: "", classLevel: 6, difficulty: "easy", status: "draft", source: "sindh", version: 1,
        questionEnglish: "", questionRomanUrdu: "",
        options: { A: { english: "", romanUrdu: "" }, B: { english: "", romanUrdu: "" }, C: { english: "", romanUrdu: "" }, D: { english: "", romanUrdu: "" } },
        correctOptionId: "A",
        hintEnglish: "", hintRomanUrdu: "", explanationEnglish: "", explanationRomanUrdu: "",
        analysis: {},
    };
}

/** The form as a question, for deriving suggestions. */
function asQuestion(form: QuestionForm): QuestionBankItem {
    return {
        id: form.id || "draft",
        microTag: form.microTag,
        prerequisiteTag: null,
        classLevel: form.classLevel as QuestionBankItem["classLevel"],
        difficulty: form.difficulty,
        question: { english: form.questionEnglish, romanUrdu: form.questionRomanUrdu },
        options: OPTION_IDS.map((id) => ({ id, english: form.options[id].english, romanUrdu: form.options[id].romanUrdu })),
        correctOptionId: form.correctOptionId,
        hint: { english: form.hintEnglish, romanUrdu: form.hintRomanUrdu },
        explanation: { english: form.explanationEnglish, romanUrdu: form.explanationRomanUrdu },
        source: form.source,
        status: form.status,
        version: form.version,
    };
}

function suggestion(form: QuestionForm, optionId: OptionId): AnalysisForm | undefined {
    const suggested = suggestOptionAnalysis(asQuestion(form), optionId);
    if (!suggested) return undefined;
    return {
        mistakeType: suggested.mistakeType,
        misconceptionTag: suggested.misconceptionTag,
        whyWrongEnglish: suggested.whyWrong.english,
        whyWrongRomanUrdu: suggested.whyWrong.romanUrdu,
        auto: true,
    };
}

/**
 * Keeps one analysis per wrong option. Suggestions that were never edited follow the
 * current options and correct answer; anything the admin wrote is left alone.
 */
function refreshAnalysis(form: QuestionForm): QuestionForm {
    const analysis: QuestionForm["analysis"] = {};
    for (const id of OPTION_IDS) {
        if (id === form.correctOptionId) continue;
        const current = form.analysis[id];
        analysis[id] = current && !current.auto ? current : suggestion(form, id);
    }
    return { ...form, analysis };
}

function fromQuestion(question: QuestionBankItem): QuestionForm {
    const options = {} as QuestionForm["options"];
    for (const id of OPTION_IDS) {
        const option = question.options.find((item) => item.id === id);
        options[id] = { english: option?.english ?? "", romanUrdu: option?.romanUrdu && option.romanUrdu !== option.english ? option.romanUrdu : "" };
    }
    const base: QuestionForm = {
        id: question.id,
        microTag: question.microTag,
        classLevel: question.classLevel,
        difficulty: question.difficulty,
        status: question.status,
        source: question.source,
        version: question.version,
        questionEnglish: question.question.english,
        questionRomanUrdu: question.question.romanUrdu,
        options,
        correctOptionId: question.correctOptionId,
        hintEnglish: question.hint.english,
        hintRomanUrdu: question.hint.romanUrdu,
        explanationEnglish: question.explanation.english,
        explanationRomanUrdu: question.explanation.romanUrdu,
        analysis: {},
    };
    // Stored reasons load as written; options without one start from the suggestion.
    for (const id of OPTION_IDS) {
        if (id === question.correctOptionId) continue;
        const stored = question.optionAnalysis?.[id];
        base.analysis[id] = stored
            ? { mistakeType: stored.mistakeType, misconceptionTag: stored.misconceptionTag, whyWrongEnglish: stored.whyWrong.english, whyWrongRomanUrdu: stored.whyWrong.romanUrdu, auto: false }
            : suggestion(base, id);
    }
    return base;
}

/** Roman Urdu is optional for admins; an empty translation falls back to the English. */
const orEnglish = (romanUrdu: string, english: string) => romanUrdu.trim() || english;

export function QuestionEditor({
    concepts,
    initial,
    onSave,
    onClear,
}: {
    concepts: MicroConcept[];
    initial: QuestionBankItem | null;
    onSave: (payload: QuestionPayload, isUpdate: boolean) => Promise<boolean>;
    onClear: () => void;
}) {
    const [form, setForm] = useState<QuestionForm>(() => (initial ? fromQuestion(initial) : blankForm()));
    const [saving, setSaving] = useState(false);

    // Suggestions follow the options and correct answer until the admin edits them.
    useEffect(() => {
        setForm((current) => refreshAnalysis(current));
    }, [form.correctOptionId, form.microTag, form.options.A.english, form.options.B.english, form.options.C.english, form.options.D.english]);

    const update = (patch: Partial<QuestionForm>) => setForm((current) => ({ ...current, ...patch }));
    const updateOption = (id: OptionId, patch: Partial<{ english: string; romanUrdu: string }>) =>
        setForm((current) => ({ ...current, options: { ...current.options, [id]: { ...current.options[id], ...patch } } }));
    const updateAnalysis = (id: OptionId, patch: Partial<AnalysisForm>) =>
        setForm((current) => ({ ...current, analysis: { ...current.analysis, [id]: { ...current.analysis[id]!, ...patch } } }));

    /** Choosing a tag fills in its predefined reason unless the admin already wrote one. */
    function chooseTag(id: OptionId, tag: MisconceptionTag) {
        const current = form.analysis[id];
        const preset = analysisForTag(tag, form.options[form.correctOptionId].english);
        updateAnalysis(id, {
            misconceptionTag: tag,
            mistakeType: preset.mistakeType,
            ...(!current || current.auto || !current.whyWrongEnglish.trim()
                ? { whyWrongEnglish: preset.whyWrong.english, whyWrongRomanUrdu: preset.whyWrong.romanUrdu, auto: true }
                : {}),
        });
    }

    function resetSuggestions() {
        setForm((current) => {
            const analysis: QuestionForm["analysis"] = {};
            for (const id of OPTION_IDS) if (id !== current.correctOptionId) analysis[id] = suggestion(current, id);
            return { ...current, analysis };
        });
    }

    async function submit() {
        const concept = concepts.find((item) => item.microTag === form.microTag);
        const payload: QuestionPayload = {
            ...(form.id ? { id: form.id } : {}),
            microTag: form.microTag,
            prerequisiteTag: concept?.prerequisiteTag ?? null,
            classLevel: form.classLevel as QuestionBankItem["classLevel"],
            difficulty: form.difficulty,
            question: { english: form.questionEnglish, romanUrdu: orEnglish(form.questionRomanUrdu, form.questionEnglish) },
            options: OPTION_IDS.map((id) => ({ id, english: form.options[id].english, romanUrdu: orEnglish(form.options[id].romanUrdu, form.options[id].english) })),
            correctOptionId: form.correctOptionId,
            hint: { english: form.hintEnglish, romanUrdu: orEnglish(form.hintRomanUrdu, form.hintEnglish) },
            explanation: { english: form.explanationEnglish, romanUrdu: orEnglish(form.explanationRomanUrdu, form.explanationEnglish) },
            optionAnalysis: Object.fromEntries(OPTION_IDS
                .filter((id) => id !== form.correctOptionId && form.analysis[id])
                .map((id) => {
                    const item = form.analysis[id]!;
                    return [id, {
                        mistakeType: item.mistakeType,
                        misconceptionTag: item.misconceptionTag,
                        whyWrong: { english: item.whyWrongEnglish, romanUrdu: orEnglish(item.whyWrongRomanUrdu, item.whyWrongEnglish) },
                    }];
                })),
            source: form.source,
            status: form.status,
            version: form.version,
        };
        setSaving(true);
        try {
            const saved = await onSave(payload, Boolean(form.id));
            if (saved) setForm(blankForm());
        } finally {
            setSaving(false);
        }
    }

    const wrongOptions = OPTION_IDS.filter((id) => id !== form.correctOptionId);

    return (
        <div className="space-y-6">
            <div className="grid gap-3 md:grid-cols-4">
                <Field label="ID (blank for new)" value={form.id} onChange={() => undefined} disabled />
                <SelectField label="Concept" value={form.microTag}
                    options={concepts.map((concept) => [concept.microTag, `Class ${concept.classLevel} · ${concept.title.english}`])}
                    onChange={(value) => update({ microTag: value, classLevel: concepts.find((concept) => concept.microTag === value)?.classLevel ?? 6 })} />
                <SelectField label="Difficulty" value={form.difficulty} options={[["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]} onChange={(value) => update({ difficulty: value as Difficulty })} />
                <SelectField label="Status" value={form.status} options={[["draft", "Draft"], ["published", "Published"], ["archived", "Archived"]]} onChange={(value) => update({ status: value as ContentStatus })} />
                <div className="md:col-span-2"><Field label="Question (English)" value={form.questionEnglish} onChange={(value) => update({ questionEnglish: value })} /></div>
                <div className="md:col-span-2"><Field label="Question (Roman Urdu, optional)" value={form.questionRomanUrdu} onChange={(value) => update({ questionRomanUrdu: value })} /></div>
                <SelectField label="Source" value={form.source} options={[["sindh", "Sindh"], ["oxford", "Oxford"]]} onChange={(value) => update({ source: value as "sindh" | "oxford" })} />
            </div>

            <section className="space-y-3">
                <h3 className="text-sm font-semibold">Options</h3>
                <div className="grid gap-3 md:grid-cols-2">
                    {OPTION_IDS.map((id) => (
                        <div key={id} className={`rounded-lg border p-3 ${form.correctOptionId === id ? "border-emerald-400 bg-emerald-50/60" : ""}`}>
                            <div className="mb-2 flex items-center justify-between">
                                <span className="font-semibold">Option {id}</span>
                                <label className="flex items-center gap-1.5 text-xs font-medium">
                                    <input type="radio" name="correct-option" checked={form.correctOptionId === id} onChange={() => update({ correctOptionId: id })} />
                                    Correct answer
                                </label>
                            </div>
                            <div className="grid gap-2">
                                <Input aria-label={`Option ${id} in English`} placeholder="English" value={form.options[id].english} onChange={(event) => updateOption(id, { english: event.target.value })} />
                                <Input aria-label={`Option ${id} in Roman Urdu`} placeholder="Roman Urdu (optional)" value={form.options[id].romanUrdu} onChange={(event) => updateOption(id, { romanUrdu: event.target.value })} />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-sm font-semibold">Why each wrong option is wrong</h3>
                        <p className="text-xs text-muted-foreground">
                            Filled in automatically from the options and a predefined misconception. Pick a different tag or rewrite the reason to make it your own.
                        </p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={resetSuggestions}><Wand2 className="mr-2 h-4 w-4" />Reset to suggestions</Button>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                    {wrongOptions.map((id) => {
                        const item = form.analysis[id];
                        if (!item) return null;
                        return (
                            <div key={id} className="space-y-2 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold">Option {id}{form.options[id].english ? `: ${form.options[id].english}` : ""}</span>
                                    {item.auto ? <Badge variant="outline" className="text-[10px]">Suggested</Badge> : <Badge className="text-[10px]">Written</Badge>}
                                </div>
                                <SelectField label="Misconception tag" value={item.misconceptionTag}
                                    options={MISCONCEPTION_TAGS.map((tag) => [tag, MISCONCEPTIONS[tag].label.english])}
                                    onChange={(value) => chooseTag(id, value as MisconceptionTag)} />
                                <SelectField label="Mistake type" value={item.mistakeType}
                                    options={MISTAKE_TYPES.map((type) => [type, MISTAKE_TYPE_LABELS[type].english])}
                                    onChange={(value) => updateAnalysis(id, { mistakeType: value as MistakeType })} />
                                <TextArea label="Why wrong (English)" value={item.whyWrongEnglish} onChange={(value) => updateAnalysis(id, { whyWrongEnglish: value, auto: false })} />
                                <TextArea label="Why wrong (Roman Urdu, optional)" value={item.whyWrongRomanUrdu} onChange={(value) => updateAnalysis(id, { whyWrongRomanUrdu: value, auto: false })} />
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="grid gap-3 md:grid-cols-2">
                <TextArea label="Hint (English)" value={form.hintEnglish} onChange={(value) => update({ hintEnglish: value })} />
                <TextArea label="Hint (Roman Urdu, optional)" value={form.hintRomanUrdu} onChange={(value) => update({ hintRomanUrdu: value })} />
                <TextArea label="Explanation of the correct answer (English)" value={form.explanationEnglish} onChange={(value) => update({ explanationEnglish: value })} />
                <TextArea label="Explanation (Roman Urdu, optional)" value={form.explanationRomanUrdu} onChange={(value) => update({ explanationRomanUrdu: value })} />
            </section>

            <div className="flex gap-2">
                <Button onClick={submit} disabled={saving || !form.microTag}><Save className="mr-2 h-4 w-4" />{form.id ? "Update question" : "Save question"}</Button>
                <Button variant="outline" onClick={() => { setForm(blankForm()); onClear(); }}><Plus className="mr-2 h-4 w-4" />New question</Button>
            </div>
        </div>
    );
}

function Field({ label, value, onChange, type = "text", disabled = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) {
    const id = useId();
    return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><Input id={id} type={type} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></div>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    const id = useId();
    return (
        <div className="space-y-1">
            <Label htmlFor={id}>{label}</Label>
            <textarea
                id={id}
                className="min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={value}
                onChange={(event) => onChange(event.target.value)}
            />
        </div>
    );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
    const id = useId();
    return (
        <div className="space-y-1">
            <Label htmlFor={id}>{label}</Label>
            <Select value={value || undefined} onValueChange={onChange}>
                <SelectTrigger id={id} className="w-full bg-white"><SelectValue placeholder={`Select ${label.toLowerCase()}`} /></SelectTrigger>
                <SelectContent>{options.map(([id, title]) => <SelectItem key={id} value={id}>{title}</SelectItem>)}</SelectContent>
            </Select>
        </div>
    );
}

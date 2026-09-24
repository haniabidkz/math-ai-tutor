"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MicroConcept, QuestionBankItem } from "@/types/curriculum";

/** Above this many questions, the admin types the number to confirm instead of clicking OK. */
export const TYPED_CONFIRM_THRESHOLD = 20;

type TypeFilter = "" | "practice" | "diagnostic-6" | "diagnostic-7" | "diagnostic-8";

interface Filters {
    text: string;
    microTag: string;
    classLevel: string;
    difficulty: string;
    status: string;
    type: TypeFilter;
}

const NO_FILTERS: Filters = { text: "", microTag: "", classLevel: "", difficulty: "", status: "", type: "" };

function matches(question: QuestionBankItem, filters: Filters): boolean {
    const text = filters.text.trim().toLowerCase();
    if (text && !`${question.id} ${question.microTag} ${question.question.english}`.toLowerCase().includes(text)) return false;
    if (filters.microTag && question.microTag !== filters.microTag) return false;
    if (filters.classLevel && String(question.classLevel) !== filters.classLevel) return false;
    if (filters.difficulty && question.difficulty !== filters.difficulty) return false;
    if (filters.status && question.status !== filters.status) return false;
    if (filters.type === "practice" && question.purpose === "diagnostic") return false;
    if (filters.type.startsWith("diagnostic-")) {
        if (question.purpose !== "diagnostic" || String(question.diagnosticFor) !== filters.type.slice("diagnostic-".length)) return false;
    }
    return true;
}

/**
 * Asks before deleting. Small deletions need a click on OK; large ones need the number typed,
 * so a whole bank is never removed by accident.
 */
export function confirmDeletion(questions: QuestionBankItem[]): boolean {
    const count = questions.length;
    const diagnostic = questions.filter((question) => question.purpose === "diagnostic").length;
    const lines = [
        count === 1 ? `Delete ${questions[0].id}?` : `Delete ${count} questions? This cannot be undone.`,
        diagnostic
            ? `${diagnostic} of them ${diagnostic === 1 ? "is a diagnostic test question" : "are diagnostic test questions"}. The test keeps working from its built-in copy, but your edits to ${diagnostic === 1 ? "it" : "them"} are lost.`
            : "",
        "Students' past results are not affected.",
    ].filter(Boolean);
    if (count <= TYPED_CONFIRM_THRESHOLD) return window.confirm(lines.join("\n\n"));
    const typed = window.prompt(`${lines.join("\n\n")}\n\nType ${count} to confirm.`);
    return typed?.trim() === String(count);
}

export function QuestionList({
    questions,
    concepts,
    truncated = false,
    onEdit,
    onDelete,
}: {
    questions: QuestionBankItem[];
    concepts: MicroConcept[];
    truncated?: boolean;
    onEdit: (question: QuestionBankItem) => void;
    /** Deletes the given questions; resolves true when they are gone. */
    onDelete: (ids: string[]) => Promise<boolean>;
}) {
    const [filters, setFilters] = useState<Filters>(NO_FILTERS);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [deleting, setDeleting] = useState(false);
    const headerCheckbox = useRef<HTMLInputElement>(null);

    const visible = useMemo(() => questions.filter((question) => matches(question, filters)), [questions, filters]);
    const filtered = Object.values(filters).some(Boolean);
    const selectedVisible = visible.filter((question) => selected.has(question.id));
    const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;

    // A new filter starts a new selection, so nothing hidden is ever deleted by mistake.
    useEffect(() => setSelected(new Set()), [filters]);

    // Questions that are gone after a refresh drop out of the selection.
    useEffect(() => {
        setSelected((current) => {
            const ids = new Set(questions.map((question) => question.id));
            const kept = [...current].filter((id) => ids.has(id));
            return kept.length === current.size ? current : new Set(kept);
        });
    }, [questions]);

    useEffect(() => {
        if (headerCheckbox.current) headerCheckbox.current.indeterminate = selectedVisible.length > 0 && !allVisibleSelected;
    }, [selectedVisible.length, allVisibleSelected]);

    const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

    function toggle(id: string) {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    function toggleAllVisible() {
        setSelected(allVisibleSelected ? new Set() : new Set(visible.map((question) => question.id)));
    }

    async function remove(targets: QuestionBankItem[]) {
        if (!targets.length || !confirmDeletion(targets)) return;
        setDeleting(true);
        try {
            if (await onDelete(targets.map((question) => question.id))) setSelected(new Set());
        } finally {
            setDeleting(false);
        }
    }

    const conceptOptions: Array<[string, string]> = concepts.map((concept) => [concept.microTag, `Class ${concept.classLevel} · ${concept.title.english}`]);

    return (
        <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="space-y-1 lg:col-span-2">
                    <Label htmlFor="question-filter-text">Search</Label>
                    <Input id="question-filter-text" placeholder="ID, concept or question text" value={filters.text} onChange={(event) => update({ text: event.target.value })} />
                </div>
                <FilterSelect label="Concept" value={filters.microTag} onChange={(microTag) => update({ microTag })} options={[["", "All concepts"], ...conceptOptions]} />
                <FilterSelect label="Class" value={filters.classLevel} onChange={(classLevel) => update({ classLevel })}
                    options={[["", "All classes"], ["5", "Class 5"], ["6", "Class 6"], ["7", "Class 7"], ["8", "Class 8"]]} />
                <FilterSelect label="Difficulty" value={filters.difficulty} onChange={(difficulty) => update({ difficulty })}
                    options={[["", "All"], ["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]} />
                <FilterSelect label="Status" value={filters.status} onChange={(status) => update({ status })}
                    options={[["", "All"], ["published", "Published"], ["draft", "Draft"], ["archived", "Archived"]]} />
                <FilterSelect label="Type" value={filters.type} onChange={(type) => update({ type: type as TypeFilter })}
                    options={[["", "All questions"], ["practice", "Practice questions"], ["diagnostic-6", "Diagnostic: Class 6 test"], ["diagnostic-7", "Diagnostic: Class 7 test"], ["diagnostic-8", "Diagnostic: Class 8 test"]]} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">
                    Showing {visible.length} of {questions.length}{selectedVisible.length ? ` · ${selectedVisible.length} selected` : ""}
                </span>
                {filtered ? <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}><X className="mr-1 h-4 w-4" />Clear filters</Button> : null}
                <div className="ml-auto flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={!selectedVisible.length || deleting} onClick={() => remove(selectedVisible)}>
                        <Trash2 className="mr-2 h-4 w-4 text-destructive" />Delete selected ({selectedVisible.length})
                    </Button>
                    <Button size="sm" variant="destructive" disabled={!visible.length || deleting} onClick={() => remove(visible)}>
                        <Trash2 className="mr-2 h-4 w-4" />{filtered ? `Delete all shown (${visible.length})` : `Delete all (${visible.length})`}
                    </Button>
                </div>
            </div>

            {truncated ? (
                <Alert><AlertDescription>Only the first {questions.length} questions were loaded. Delete or filter some to see the rest.</AlertDescription></Alert>
            ) : null}

            <div className="max-h-[620px] overflow-auto">
                <table className="w-full min-w-[1000px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100">
                        <tr>
                            <th className="w-10 p-2">
                                <input ref={headerCheckbox} type="checkbox" aria-label="Select all shown questions" checked={allVisibleSelected} disabled={!visible.length} onChange={toggleAllVisible} />
                            </th>
                            <th className="p-2">ID</th><th className="p-2">Concept</th><th className="p-2">Class</th><th className="p-2">Difficulty</th>
                            <th className="p-2">Status</th><th className="p-2">Reasons</th><th className="p-2">Question</th><th className="p-2">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {visible.map((question) => {
                            const written = Object.keys(question.optionAnalysis ?? {}).length;
                            const isSelected = selected.has(question.id);
                            return (
                                <tr key={question.id} className={isSelected ? "bg-sky-50" : undefined}>
                                    <td className="p-2">
                                        <input type="checkbox" aria-label={`Select ${question.id}`} checked={isSelected} onChange={() => toggle(question.id)} />
                                    </td>
                                    <td className="p-2 font-mono text-xs">
                                        {question.id}
                                        {question.purpose === "diagnostic" ? <Badge className="ml-2 bg-violet-600 text-[10px]">Diagnostic · Class {question.diagnosticFor} test</Badge> : null}
                                    </td>
                                    <td className="p-2">{question.microTag}</td>
                                    <td className="p-2">Class {question.classLevel}</td>
                                    <td className="p-2"><Badge variant="outline">{question.difficulty}</Badge></td>
                                    <td className="p-2">{question.status}</td>
                                    <td className="p-2">{written === 3 ? <Badge variant="secondary">3 saved</Badge> : <span className="text-xs text-muted-foreground">auto</span>}</td>
                                    <td className="max-w-md p-2">{question.question.english}</td>
                                    <td className="p-2">
                                        <div className="flex gap-1">
                                            <Button size="icon" variant="ghost" title="Edit" aria-label={`Edit ${question.id}`} onClick={() => onEdit(question)}><Pencil className="h-4 w-4" /></Button>
                                            <Button size="icon" variant="ghost" title="Delete" aria-label={`Delete ${question.id}`} disabled={deleting} onClick={() => remove([question])}>
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {!visible.length ? <tr><td colSpan={9} className="p-4 text-center text-muted-foreground">No questions match these filters.</td></tr> : null}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
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

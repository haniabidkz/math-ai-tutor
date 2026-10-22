"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { jsonInit, schoolApi } from "@/components/school/school-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SUPPORTED_SCHOOL_CLASSES } from "@/lib/schools";
import type { SchoolSection } from "@/types/school";

/** Classes and their sections (6-A, 6-B …): create, rename, close, delete when empty. */
export function SectionManager({ schoolId, sections, onChanged }: { schoolId?: string | null; sections: SchoolSection[]; onChanged: () => Promise<void> | void }) {
    const [classLevel, setClassLevel] = useState("6");
    const [name, setName] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

    const api = <T,>(path: string, init?: RequestInit) => schoolApi<T>(path, init, schoolId);

    async function run(task: () => Promise<unknown>, fallback: string) {
        setBusy(true);
        setError("");
        try { await task(); await onChanged(); }
        catch (caught) { setError(caught instanceof Error ? caught.message : fallback); }
        finally { setBusy(false); }
    }

    return (
        <div className="space-y-4">
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            <Card>
                <CardHeader><CardTitle className="text-base">New section</CardTitle><CardDescription>Classes come from the curriculum (6, 7, 8); sections are yours, for example A, B or Blue.</CardDescription></CardHeader>
                <CardContent>
                    <form className="flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); void run(() => api("/api/school/sections", jsonInit("POST", { classLevel: Number(classLevel), name })).then(() => setName("")), "The section could not be created"); }}>
                        <div className="space-y-1">
                            <Label htmlFor="sec-class">Class</Label>
                            <select id="sec-class" className="h-9 rounded-md border px-2 text-sm" value={classLevel} onChange={(event) => setClassLevel(event.target.value)}>
                                {SUPPORTED_SCHOOL_CLASSES.map((level) => <option key={level} value={level}>Class {level}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1"><Label htmlFor="sec-name">Section name</Label><Input id="sec-name" required placeholder="A" maxLength={20} value={name} onChange={(event) => setName(event.target.value)} /></div>
                        <Button type="submit" disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Create {classLevel}-{name.trim().toUpperCase() || "…"}</Button>
                    </form>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-3">
                {SUPPORTED_SCHOOL_CLASSES.map((level) => {
                    const inClass = sections.filter((section) => section.classLevel === level);
                    return (
                        <Card key={level}>
                            <CardHeader className="pb-2"><CardTitle className="text-base">Class {level}</CardTitle><CardDescription>{inClass.reduce((sum, section) => sum + section.students, 0)} students in {inClass.length} section{inClass.length === 1 ? "" : "s"}</CardDescription></CardHeader>
                            <CardContent className="space-y-2">
                                {inClass.length === 0 ? <p className="text-sm text-muted-foreground">No sections yet.</p> : null}
                                {inClass.map((section) => (
                                    <div key={section.id} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${section.active ? "" : "opacity-60"}`}>
                                        {renaming?.id === section.id ? (
                                            <form className="flex flex-1 items-center gap-2" onSubmit={(event) => { event.preventDefault(); void run(() => api("/api/school/sections", jsonInit("PATCH", { id: section.id, name: renaming.name })).then(() => setRenaming(null)), "The section could not be renamed"); }}>
                                                <Input className="h-8" value={renaming.name} maxLength={20} onChange={(event) => setRenaming({ id: section.id, name: event.target.value })} />
                                                <Button size="sm" type="submit" disabled={busy}>Save</Button>
                                                <Button size="sm" type="button" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
                                            </form>
                                        ) : (
                                            <>
                                                <div><strong>{section.label}</strong> <span className="text-xs text-muted-foreground">· {section.students} students</span>{!section.active ? <Badge variant="outline" className="ml-2 text-[10px]">Closed</Badge> : null}</div>
                                                <div className="flex gap-1">
                                                    <Button size="sm" variant="ghost" title="Rename" onClick={() => setRenaming({ id: section.id, name: section.name })}><Pencil className="h-4 w-4" /></Button>
                                                    <Button size="sm" variant="ghost" title={section.active ? "Close section" : "Reopen section"} onClick={() => run(() => api("/api/school/sections", jsonInit("PATCH", { id: section.id, active: !section.active })), "The section could not be updated")}>{section.active ? "Close" : "Reopen"}</Button>
                                                    <Button size="sm" variant="ghost" title="Delete (only when empty)" disabled={section.students > 0} onClick={() => { if (window.confirm(`Delete ${section.label}?`)) void run(() => api(`/api/school/sections?id=${encodeURIComponent(section.id)}`, { method: "DELETE" }), "The section could not be deleted"); }}><Trash2 className="h-4 w-4 text-red-600" /></Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

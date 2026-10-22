"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Lock, NotebookPen, Package, Plus, School, Trash2, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { freeScopeLabel } from "@/lib/access";
import { MAX_HOMEWORK_QUESTIONS, MAX_PACKET_MODULES, MIN_HOMEWORK_QUESTIONS } from "@/lib/homework";
import type { LocalizedText, StudentClassLevel } from "@/types/curriculum";
import type { HomeworkAssignment } from "@/types/homework";

interface AssignableStudent {
    uid: string;
    name: string;
    class: number;
}

/** A chapter and its lessons, as the server lists them for one class. */
interface ModuleTopic {
    topicId: string;
    title: LocalizedText;
    /** The school's plan has ended and every lesson of this chapter is outside the free ones. */
    locked?: boolean;
    concepts: Array<{ microTag: string; title: LocalizedText; locked?: boolean }>;
}

interface AssignScope {
    schoolId: string | null;
    schoolName: string | null;
    plan: "trial" | "paid" | "expired" | null;
    sections: Array<{ id: string; classLevel: number; label: string }>;
    lockedAssignments: boolean;
    freeChapterCount: number;
    freeLessonsPerChapter: number;
}

interface ClassSummary {
    classLevel: StudentClassLevel;
    students: number;
}

function todayPlus(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

/**
 * Lets a teacher see their classes and assign one module, or a packet of modules,
 * to a whole class or to named students in it.
 */
export function HomeworkAssigner({ getToken, students }: { getToken: () => Promise<string>; students: AssignableStudent[] }) {
    const [myClasses, setMyClasses] = useState<ClassSummary[]>([]);
    const [hasAssignedClasses, setHasAssignedClasses] = useState(true);
    const [classLevel, setClassLevel] = useState<StudentClassLevel | null>(null);
    const [microTags, setMicroTags] = useState<string[]>([]);
    const [packetTitle, setPacketTitle] = useState("");
    const [questionCount, setQuestionCount] = useState(5);
    const [dueDate, setDueDate] = useState(todayPlus(7));
    const [allStudents, setAllStudents] = useState(true);
    const [selectedUids, setSelectedUids] = useState<string[]>([]);
    const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
    const [modules, setModules] = useState<Partial<Record<StudentClassLevel, ModuleTopic[]>>>({});
    const [scope, setScope] = useState<AssignScope | null>(null);
    const [sectionId, setSectionId] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const topics = useMemo(() => (classLevel ? modules[classLevel] ?? [] : []), [classLevel, modules]);
    const classStudents = students.filter((student) => Number(student.class) === classLevel);

    useEffect(() => { void load(); }, []);
    useEffect(() => { setMicroTags([]); setSelectedUids([]); setPacketTitle(""); setSectionId(""); }, [classLevel]);
    const classSections = (scope?.sections ?? []).filter((section) => section.classLevel === classLevel);

    async function load() {
        try {
            const response = await fetch("/api/homework", { headers: { Authorization: `Bearer ${await getToken()}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setAssignments(data.homework ?? []);
            setMyClasses(data.myClasses ?? []);
            setModules(data.modules ?? {});
            setScope(data.scope ?? null);
            setHasAssignedClasses(data.hasAssignedClasses !== false);
            setClassLevel((current) => current ?? data.myClasses?.[0]?.classLevel ?? null);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Homework could not be loaded");
        }
    }

    function toggleModule(microTag: string) {
        setMicroTags((current) => current.includes(microTag)
            ? current.filter((tag) => tag !== microTag)
            : current.length >= MAX_PACKET_MODULES ? current : [...current, microTag]);
    }

    async function assign() {
        if (!classLevel) return;
        setBusy(true); setError(""); setNotice("");
        try {
            const response = await fetch("/api/homework", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
                body: JSON.stringify({
                    microTags,
                    packetTitle: packetTitle.trim() || undefined,
                    classLevel,
                    questionCount: Number(questionCount),
                    dueDate,
                    allStudents,
                    studentUids: allStudents ? [] : selectedUids,
                    sectionId: sectionId || undefined,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setNotice(microTags.length > 1 ? `Packet of ${microTags.length} modules assigned to Class ${classLevel}.` : `Homework assigned to Class ${classLevel}.`);
            setMicroTags([]);
            setPacketTitle("");
            await load();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Homework could not be assigned");
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: string) {
        if (!window.confirm("Remove this homework?")) return;
        try {
            const response = await fetch(`/api/homework?id=${encodeURIComponent(id)}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${await getToken()}` },
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            await load();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Homework could not be removed");
        }
    }

    return (
        <div className="grid gap-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base"><School className="h-4 w-4" />My classes</CardTitle>
                    <CardDescription>
                        {hasAssignedClasses
                            ? "Choose a class to assign homework to."
                            : "No classes have been assigned to you yet, so every class is shown. Ask an admin to set your classes."}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {myClasses.map((item) => (
                            <button
                                key={item.classLevel}
                                type="button"
                                onClick={() => setClassLevel(item.classLevel)}
                                aria-pressed={classLevel === item.classLevel}
                                className={`rounded-lg border p-4 text-left transition ${classLevel === item.classLevel ? "border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500" : "hover:border-slate-400"}`}
                            >
                                <p className="text-lg font-bold">Class {item.classLevel}</p>
                                <p className="text-xs text-muted-foreground">{item.students} {item.students === 1 ? "student" : "students"}</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {assignments.filter((homework) => homework.classLevel === item.classLevel).length} assignments
                                </p>
                            </button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {classLevel ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base"><NotebookPen className="h-4 w-4" />Assign homework to Class {classLevel}</CardTitle>
                        <CardDescription>Pick one module, or several to send them as one packet. Any topic can be assigned.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                        {notice ? <Alert className="border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}
                        {scope?.lockedAssignments ? (
                            <Alert className="border-amber-300 bg-amber-50"><Lock className="h-4 w-4" /><AlertDescription>Your school&apos;s plan has ended, so homework can be set from {freeScopeLabel(scope)} of each class only. Ask your school to renew to open the rest.</AlertDescription></Alert>
                        ) : null}

                        <div className="space-y-3">
                            <Label>Modules {microTags.length ? <Badge variant="secondary" className="ml-2">{microTags.length} selected</Badge> : null}</Label>
                            {!topics.length ? <p className="text-sm text-muted-foreground">No lessons exist for this class yet.</p> : null}
                            {topics.map((topic) => (
                                <div key={topic.topicId} className={`rounded-lg border p-3 ${topic.locked ? "bg-slate-50 opacity-70" : ""}`}>
                                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">{topic.locked ? <Lock className="h-3 w-3" /> : null}{topic.title.english}{topic.locked ? <span className="normal-case">· paid plan</span> : null}</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {topic.concepts.map((concept) => (
                                            <label key={concept.microTag} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    disabled={concept.locked}
                                                    checked={microTags.includes(concept.microTag)}
                                                    onChange={() => toggleModule(concept.microTag)}
                                                />
                                                <span className={concept.locked ? "text-muted-foreground" : ""}>{concept.title.english}{concept.locked ? <Lock className="ml-1 inline h-3 w-3" /> : null}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                            {microTags.length > 1 ? (
                                <div className="space-y-1 md:col-span-3">
                                    <Label htmlFor="packet-title"><Package className="mr-1 inline h-3.5 w-3.5" />Packet name (optional)</Label>
                                    <Input id="packet-title" placeholder="e.g. Week 3 revision" value={packetTitle} maxLength={80} onChange={(event) => setPacketTitle(event.target.value)} />
                                </div>
                            ) : null}
                            <div className="space-y-1">
                                <Label htmlFor="question-count">Questions per module</Label>
                                <Input id="question-count" type="number" min={MIN_HOMEWORK_QUESTIONS} max={MAX_HOMEWORK_QUESTIONS} value={questionCount} onChange={(event) => setQuestionCount(Number(event.target.value))} />
                            </div>
                            <div className="space-y-1">
                                <Label htmlFor="due-date">Due date</Label>
                                <Input id="due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                            </div>
                            <div className="space-y-1">
                                <Label>Assign to</Label>
                                <div className="flex gap-2">
                                    <Button type="button" size="sm" variant={allStudents ? "default" : "outline"} onClick={() => setAllStudents(true)}>Whole class</Button>
                                    <Button type="button" size="sm" variant={!allStudents ? "default" : "outline"} onClick={() => setAllStudents(false)}>Selected students</Button>
                                </div>
                            </div>
                            {scope?.schoolId && allStudents ? (
                                <div className="space-y-1 md:col-span-3">
                                    <Label htmlFor="homework-section">Section</Label>
                                    <select id="homework-section" className="h-9 w-full rounded-md border px-2 text-sm md:w-72" value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
                                        <option value="">Every Class {classLevel} student in {scope.schoolName ?? "the school"}</option>
                                        {classSections.map((section) => <option key={section.id} value={section.id}>{section.label} only</option>)}
                                    </select>
                                </div>
                            ) : null}
                        </div>

                        {!allStudents ? (
                            <div className="rounded-lg border p-3">
                                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground"><Users className="h-3 w-3" />Students in Class {classLevel}</p>
                                <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                                    {classStudents.map((student) => (
                                        <label key={student.uid} className="flex items-center gap-2 text-sm">
                                            <input
                                                type="checkbox"
                                                checked={selectedUids.includes(student.uid)}
                                                onChange={(event) => setSelectedUids((current) =>
                                                    event.target.checked ? [...current, student.uid] : current.filter((uid) => uid !== student.uid))}
                                            />
                                            {student.name}
                                        </label>
                                    ))}
                                    {classStudents.length === 0 ? <p className="text-xs text-muted-foreground">No students in this class yet.</p> : null}
                                </div>
                            </div>
                        ) : null}

                        <Button onClick={assign} disabled={busy || microTags.length === 0}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            {microTags.length > 1 ? `Assign packet (${microTags.length} modules)` : "Assign homework"}
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Assigned homework</CardTitle>
                    <CardDescription>{assignments.length} assignment{assignments.length === 1 ? "" : "s"} across your classes</CardDescription>
                </CardHeader>
                <CardContent>
                    {assignments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing assigned yet.</p>
                    ) : (
                        <ul className="grid gap-2">
                            {assignments.map((item) => (
                                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 p-3">
                                    <div className="min-w-0">
                                        {item.packetTitle ? <p className="text-[11px] font-semibold uppercase text-indigo-700">{item.packetTitle}</p> : null}
                                        <p className="text-sm font-semibold">{item.title?.english ?? item.microTag}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.sectionLabel ?? `Class ${item.classLevel}`} · {item.questionCount} questions · {item.allStudents ? (item.sectionLabel ? "whole section" : "whole class") : `${item.studentUids.length} students`}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="gap-1"><CalendarDays className="h-3 w-3" />{item.dueDate}</Badge>
                                        <Button size="icon" variant="ghost" title="Remove" onClick={() => remove(item.id)}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, NotebookPen, Plus, Trash2, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getTopicsForClass } from "@/lib/curriculum";
import { MAX_HOMEWORK_QUESTIONS, MIN_HOMEWORK_QUESTIONS } from "@/lib/homework";
import type { StudentClassLevel } from "@/types/curriculum";
import type { HomeworkAssignment } from "@/types/homework";

interface AssignableStudent {
    uid: string;
    name: string;
    class: number;
}

function todayPlus(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
}

/** Lets a teacher or admin assign any topic as homework, to a class or to named students. */
export function HomeworkAssigner({ getToken, students }: { getToken: () => Promise<string>; students: AssignableStudent[] }) {
    const [classLevel, setClassLevel] = useState<StudentClassLevel>(6);
    const [microTag, setMicroTag] = useState("");
    const [questionCount, setQuestionCount] = useState(5);
    const [dueDate, setDueDate] = useState(todayPlus(7));
    const [allStudents, setAllStudents] = useState(true);
    const [selectedUids, setSelectedUids] = useState<string[]>([]);
    const [assignments, setAssignments] = useState<HomeworkAssignment[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const concepts = useMemo(
        () => getTopicsForClass(classLevel).flatMap((topic) =>
            topic.concepts.map((concept) => ({
                microTag: concept.microTag,
                label: `${topic.title.english} — ${concept.title.english}`,
            }))),
        [classLevel],
    );
    const classStudents = students.filter((student) => Number(student.class) === classLevel);

    useEffect(() => { setMicroTag(concepts[0]?.microTag ?? ""); setSelectedUids([]); }, [classLevel]);
    useEffect(() => { void load(); }, []);

    async function load() {
        try {
            const response = await fetch("/api/homework", { headers: { Authorization: `Bearer ${await getToken()}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setAssignments(data.homework);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Homework could not be loaded");
        }
    }

    async function assign() {
        setBusy(true); setError(""); setNotice("");
        try {
            const response = await fetch("/api/homework", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${await getToken()}` },
                body: JSON.stringify({
                    microTag, classLevel, questionCount: Number(questionCount), dueDate,
                    allStudents, studentUids: allStudents ? [] : selectedUids,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            setNotice("Homework assigned.");
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
                    <CardTitle className="flex items-center gap-2 text-base"><NotebookPen className="h-4 w-4" />Assign homework</CardTitle>
                    <CardDescription>Any topic can be assigned. Weak topics are also recommended to students automatically.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                    {notice ? <Alert className="border-emerald-300 bg-emerald-50"><AlertDescription>{notice}</AlertDescription></Alert> : null}

                    <div className="grid gap-3 md:grid-cols-4">
                        <div className="space-y-1">
                            <Label>Class</Label>
                            <Select value={String(classLevel)} onValueChange={(value) => setClassLevel(Number(value) as StudentClassLevel)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {[6, 7, 8].map((level) => <SelectItem key={level} value={String(level)}>Class {level}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                            <Label>Topic or lesson</Label>
                            <Select value={microTag} onValueChange={setMicroTag}>
                                <SelectTrigger><SelectValue placeholder="Select a concept" /></SelectTrigger>
                                <SelectContent>
                                    {concepts.map((concept) => (
                                        <SelectItem key={concept.microTag} value={concept.microTag}>{concept.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Questions</Label>
                            <Input
                                type="number"
                                min={MIN_HOMEWORK_QUESTIONS}
                                max={MAX_HOMEWORK_QUESTIONS}
                                value={questionCount}
                                onChange={(event) => setQuestionCount(Number(event.target.value))}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Due date</Label>
                            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                        </div>
                        <div className="space-y-1 md:col-span-3">
                            <Label>Assign to</Label>
                            <Select value={allStudents ? "class" : "selected"} onValueChange={(value) => setAllStudents(value === "class")}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="class">Whole class ({classStudents.length} students)</SelectItem>
                                    <SelectItem value="selected">Selected students</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {!allStudents ? (
                        <div className="rounded-lg border p-3">
                            <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                                <Users className="h-3 w-3" />Students
                            </p>
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
                                {classStudents.length === 0 ? <p className="text-xs text-muted-foreground">No students in this class.</p> : null}
                            </div>
                        </div>
                    ) : null}

                    <Button onClick={assign} disabled={busy || !microTag}>
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}Assign homework
                    </Button>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Assigned homework</CardTitle>
                    <CardDescription>{assignments.length} assignment{assignments.length === 1 ? "" : "s"}</CardDescription>
                </CardHeader>
                <CardContent>
                    {assignments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nothing assigned yet.</p>
                    ) : (
                        <ul className="grid gap-2">
                            {assignments.map((item) => (
                                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-slate-50 p-3">
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold">{item.title?.english ?? item.microTag}</p>
                                        <p className="text-xs text-muted-foreground">
                                            Class {item.classLevel} · {item.questionCount} questions · {item.allStudents ? "whole class" : `${item.studentUids.length} students`}
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

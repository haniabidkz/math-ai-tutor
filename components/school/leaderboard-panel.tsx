"use client";

import { useEffect, useState } from "react";
import { Crown, Loader2, Medal, RefreshCw, TrendingUp, Trophy } from "lucide-react";
import { schoolApi } from "@/components/school/school-api";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Entry { uid: string; name: string; points: number; correctAnswers: number; rank: number }
interface Improved { uid: string; name: string; points: number; previousPoints: number; gain: number }
interface Board {
    classLevel: number;
    label: string;
    participants: number;
    entries: Entry[];
    mostImproved: Improved | null;
    previous: { label: string; participants: number; top: Entry[]; mostImproved: Improved | null };
}

const CLASSES = [6, 7, 8] as const;

/** The school's own weekly leaderboard, one class at a time. */
export function LeaderboardPanel({ schoolId }: { schoolId?: string | null }) {
    const [classLevel, setClassLevel] = useState<number>(6);
    const [board, setBoard] = useState<Board | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    async function load(level = classLevel) {
        setLoading(true);
        setError("");
        try {
            setBoard(await schoolApi<Board>(`/api/school/leaderboard?class=${level}`, undefined, schoolId));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The leaderboard could not be loaded");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { void load(classLevel); }, [schoolId]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4" />Weekly leaderboards</CardTitle>
                <CardDescription>Each class has its own board. Your students compete only with students of your school in the same class; the board resets every Monday.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Class boards">
                    {CLASSES.map((level) => (
                        <Button key={level} role="tab" aria-selected={classLevel === level} size="sm" variant={classLevel === level ? "default" : "outline"} disabled={loading}
                            onClick={() => { setClassLevel(level); void load(level); }}>Class {level}</Button>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}><RefreshCw className="mr-1 h-4 w-4" />Refresh</Button>
                </div>
                {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
                {loading ? <p className="text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading the board…</p> : board ? (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">Class {board.classLevel} · week of {board.label} · {board.participants} {board.participants === 1 ? "student" : "students"} on the board</p>
                        <div className="flex items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
                            <TrendingUp className="h-5 w-5 shrink-0 text-emerald-700" />
                            <p><strong>Most improved this week:</strong> {board.mostImproved ? `${board.mostImproved.name}, +${board.mostImproved.gain} points (${board.mostImproved.previousPoints} last week, ${board.mostImproved.points} now)` : "nobody yet (it needs a student who also played last week)"}</p>
                        </div>
                        <div className="overflow-auto rounded-md border">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-xs uppercase text-muted-foreground"><tr><th className="p-3">Rank</th><th className="p-3">Student</th><th className="p-3">Points</th><th className="p-3">Correct</th></tr></thead>
                                <tbody className="divide-y">
                                    {board.entries.length === 0 ? <tr><td colSpan={4} className="p-3 text-muted-foreground">No points yet this week.</td></tr> : null}
                                    {board.entries.map((entry) => (
                                        <tr key={entry.uid}>
                                            <td className="p-3 font-semibold">{entry.rank <= 3 ? <Crown className="mr-1 inline h-4 w-4 text-amber-500" /> : null}#{entry.rank}</td>
                                            <td className="p-3">{entry.name}</td>
                                            <td className="p-3">{entry.points}</td>
                                            <td className="p-3">{entry.correctAnswers}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="rounded-md border p-3 text-sm">
                            <p className="flex items-center gap-2 font-semibold"><Medal className="h-4 w-4 text-indigo-600" />Last week · {board.previous.label}</p>
                            {board.previous.top.length ? (
                                <p className="mt-1">{board.previous.top.map((entry) => `#${entry.rank} ${entry.name} (${entry.points})`).join(" · ")}</p>
                            ) : <p className="mt-1 text-muted-foreground">Nobody earned points last week.</p>}
                            {board.previous.mostImproved ? <p className="mt-1 text-muted-foreground">Most improved: {board.previous.mostImproved.name}, +{board.previous.mostImproved.gain} points</p> : null}
                        </div>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}

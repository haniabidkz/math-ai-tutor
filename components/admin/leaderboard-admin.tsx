"use client";

import { useCallback, useEffect, useState } from "react";
import { Award, CheckCircle2, History, Lock, RefreshCw, ShieldAlert, Trophy } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { adminApi, jsonInit } from "@/lib/admin-api";
import { eligibleCandidates, LEADERBOARD_CLASSES, REWARD_PLACES, type RewardCandidate } from "@/lib/leaderboard";
import { cn } from "@/lib/utils";

interface AdminEntry {
    rank: number; uid: string; name: string; email: string; points: number; correctAnswers: number; lastScoredAt: number;
    paid: boolean; banned: boolean; suspicious: boolean; note: string;
}
interface Reward {
    weekKey: string; classLevel: number; status: "pending" | "approved";
    candidates: RewardCandidate[];
    winners: Array<{ uid: string; name: string; place: number; rank: number; points: number; delivered: boolean; deliveredAt?: number | null }>;
    approvedAt: number | null; approvedBy: string | null; label?: string;
}
interface BoardData {
    weekKey: string; label: string; classLevel: number; current: string;
    schoolId: string | null;
    schools: Array<{ id: string; name: string; code: string }>;
    weeks: Array<{ weekKey: string; label: string }>;
    finalized: boolean; finalizedAt: number | null; participants: number;
    entries: AdminEntry[]; reward: Reward | null; history: Reward[];
}
interface HistoryItem { id: string; kind: string; points: number; correctAnswers: number; label: string; weekKey: string; createdAt: number | null }

const PLACE_LABEL: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };
const formatDate = (millis: number | null | undefined) => (millis ? new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(millis) : "—");

/** Super Admin: class boards per week, membership and flags, weekly reward approval and history. */
export function LeaderboardAdmin() {
    const [classLevel, setClassLevel] = useState<number>(6);
    const [weekKey, setWeekKey] = useState<string>("");
    /** Empty for the public board of individual students; a school id for that school's own board. */
    const [schoolId, setSchoolId] = useState<string>("");
    const [data, setData] = useState<BoardData | null>(null);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [loading, setLoading] = useState(false);
    const [picks, setPicks] = useState<Record<number, string>>({});
    const [history, setHistory] = useState<{ entry: AdminEntry; items: HistoryItem[] } | null>(null);
    const [notes, setNotes] = useState<Record<string, string>>({});

    const load = useCallback(async (nextClass = classLevel, nextWeek = weekKey, nextSchool = schoolId) => {
        setLoading(true);
        setError("");
        try {
            const query = new URLSearchParams({ class: String(nextClass), ...(nextWeek ? { week: nextWeek } : {}), ...(nextSchool ? { school: nextSchool } : {}) });
            const result = await adminApi<BoardData>(`/api/admin/leaderboard?${query}`);
            setData(result);
            setWeekKey(result.weekKey);
            // Suggest the top three paid, unflagged students; the admin may change any place.
            const suggested = eligibleCandidates(result.reward?.candidates ?? []);
            setPicks(Object.fromEntries(suggested.map((candidate, index) => [index + 1, candidate.uid])));
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not load the leaderboard");
        } finally {
            setLoading(false);
        }
    }, [classLevel, weekKey, schoolId]);

    useEffect(() => { void load(6, "", ""); }, []);

    async function act(body: Record<string, unknown>, success: string) {
        setError("");
        setNotice("");
        try {
            await adminApi("/api/admin/leaderboard", jsonInit("POST", { schoolId: schoolId || null, ...body }));
            setNotice(success);
            await load();
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "The action failed");
        }
    }

    async function showHistory(entry: AdminEntry) {
        try {
            const result = await adminApi<{ history: HistoryItem[] }>(`/api/admin/leaderboard?uid=${encodeURIComponent(entry.uid)}`);
            setHistory({ entry, items: result.history });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Could not load the point history");
        }
    }

    const reward = data?.reward ?? null;
    const isPast = Boolean(data && data.weekKey < data.current);
    const pickedUids = Object.values(picks).filter(Boolean);

    return (
        <div className="space-y-5">
            <section className="rounded-lg bg-white p-4">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-1">
                        {LEADERBOARD_CLASSES.map((level) => (
                            <Button key={level} size="sm" variant={classLevel === level ? "default" : "outline"} onClick={() => { setClassLevel(level); void load(level, weekKey); }}>Class {level}</Button>
                        ))}
                    </div>
                    <select className="h-9 rounded-md border px-2 text-sm" value={schoolId} onChange={(event) => { setSchoolId(event.target.value); void load(classLevel, weekKey, event.target.value); }} aria-label="Board">
                        <option value="">Individual students (public board)</option>
                        {(data?.schools ?? []).map((school) => <option key={school.id} value={school.id}>{school.name} ({school.code})</option>)}
                    </select>
                    <select className="h-9 rounded-md border px-2 text-sm" value={weekKey} onChange={(event) => { setWeekKey(event.target.value); void load(classLevel, event.target.value); }}>
                        {(data?.weeks ?? []).map((week) => (
                            <option key={week.weekKey} value={week.weekKey}>{week.label}{week.weekKey === data?.current ? " (this week)" : ""}</option>
                        ))}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => load()} disabled={loading}><RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />Refresh</Button>
                    {data ? (
                        <span className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                            {data.finalized ? <Badge variant="secondary"><Lock className="mr-1 h-3 w-3" />Closed {formatDate(data.finalizedAt)}</Badge> : <Badge>Live</Badge>}
                            {data.participants} students
                            {isPast && !data.finalized ? <Button size="sm" variant="outline" onClick={() => act({ action: "finalize", weekKey: data.weekKey }, "Week closed and results sent.")}>Close this week</Button> : null}
                        </span>
                    ) : null}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Weeks run Monday to Sunday (Pakistan time) and close on Monday. Points, badges, streaks and lifetime XP are never reset. Rewards go to the top 3 paid members; every student counts as paid until you untick them. Flagged accounts are held until reviewed.</p>
            </section>

            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {notice ? <Alert><CheckCircle2 className="h-4 w-4" /><AlertDescription>{notice}</AlertDescription></Alert> : null}

            {data ? (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <section className="rounded-lg bg-white p-4">
                        <h2 className="mb-3 font-semibold">Class {data.classLevel} · week of {data.label}{data.schoolId ? ` · ${data.schools.find((school) => school.id === data.schoolId)?.name ?? "school"}` : " · individual students"}</h2>
                        <div className="overflow-auto">
                            <table className="w-full min-w-[860px] text-left text-sm">
                                <thead className="bg-slate-100"><tr><th className="p-2">Rank</th><th className="p-2">Student</th><th className="p-2">Points</th><th className="p-2">Correct</th><th className="p-2">Paid member</th><th className="p-2">Flags</th><th className="p-2">Note</th><th className="p-2"></th></tr></thead>
                                <tbody className="divide-y">
                                    {data.entries.length === 0 ? <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No points this week yet.</td></tr> : null}
                                    {data.entries.map((entry) => (
                                        <tr key={entry.uid} className={cn(entry.rank <= REWARD_PLACES && "bg-amber-50/60")}>
                                            <td className="p-2 font-mono">{entry.rank <= REWARD_PLACES ? <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400">{PLACE_LABEL[entry.rank]}</Badge> : `#${entry.rank}`}</td>
                                            <td className="p-2"><strong>{entry.name}</strong><p className="font-mono text-xs text-muted-foreground">{entry.email}</p></td>
                                            <td className="p-2 font-semibold">{entry.points}</td>
                                            <td className="p-2">{entry.correctAnswers}</td>
                                            <td className="p-2">
                                                <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={entry.paid} onChange={() => act({ action: "membership", uid: entry.uid, paid: !entry.paid }, `${entry.name}: ${entry.paid ? "not a paid member" : "paid member"}.`)} />Paid</label>
                                            </td>
                                            <td className="p-2">
                                                <div className="flex flex-col gap-1 text-xs">
                                                    <label className="flex items-center gap-1"><input type="checkbox" checked={entry.banned} onChange={() => act({ action: "flags", uid: entry.uid, banned: !entry.banned }, `${entry.name}: ${entry.banned ? "ban removed" : "banned from rewards"}.`)} />Banned</label>
                                                    <label className="flex items-center gap-1"><input type="checkbox" checked={entry.suspicious} onChange={() => act({ action: "flags", uid: entry.uid, suspicious: !entry.suspicious }, `${entry.name}: ${entry.suspicious ? "cleared" : "marked suspicious"}.`)} />Suspicious</label>
                                                </div>
                                            </td>
                                            <td className="p-2">
                                                <div className="flex gap-1">
                                                    <Input className="h-8 w-40 text-xs" placeholder="Review note" value={notes[entry.uid] ?? entry.note} onChange={(event) => setNotes({ ...notes, [entry.uid]: event.target.value })} />
                                                    {(notes[entry.uid] ?? entry.note) !== entry.note ? <Button size="sm" variant="outline" className="h-8" onClick={() => act({ action: "flags", uid: entry.uid, note: notes[entry.uid] ?? "" }, "Note saved.")}>Save</Button> : null}
                                                </div>
                                            </td>
                                            <td className="p-2"><Button size="sm" variant="ghost" onClick={() => showHistory(entry)}><History className="mr-1 h-4 w-4" />History</Button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="space-y-5">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Award className="h-5 w-5 text-amber-500" />Weekly rewards</CardTitle></CardHeader>
                            <CardContent className="space-y-3 text-sm">
                                {!data.finalized ? (
                                    <p className="text-muted-foreground">Rewards are decided once the week closes on Monday.</p>
                                ) : !reward ? (
                                    <p className="text-muted-foreground">No reward record for this week.</p>
                                ) : reward.status === "approved" ? (
                                    <ul className="space-y-2">
                                        {reward.winners.map((winner) => (
                                            <li key={winner.uid} className="flex items-center justify-between gap-2 rounded-lg border p-2">
                                                <span><Badge className="mr-2 bg-amber-400 text-amber-950 hover:bg-amber-400">{PLACE_LABEL[winner.place]}</Badge><strong>{winner.name}</strong> · {winner.points} pts</span>
                                                <Button size="sm" variant={winner.delivered ? "secondary" : "outline"} onClick={() => act({ action: "delivered", weekKey: data.weekKey, classLevel: data.classLevel, uid: winner.uid, delivered: !winner.delivered }, winner.delivered ? "Marked as not delivered." : "Marked delivered.")}>
                                                    {winner.delivered ? "Delivered ✓" : "Mark delivered"}
                                                </Button>
                                            </li>
                                        ))}
                                        <li className="text-xs text-muted-foreground">Approved {formatDate(reward.approvedAt)}.</li>
                                    </ul>
                                ) : (
                                    <div className="space-y-3">
                                        <p className="text-muted-foreground">Suggested: the top {REWARD_PLACES} paid members without flags. Change any place, then approve. Winners are notified.</p>
                                        {[1, 2, 3].map((place) => (
                                            <label key={place} className="flex items-center gap-2">
                                                <span className="w-10 font-semibold">{PLACE_LABEL[place]}</span>
                                                <select className="h-9 flex-1 rounded-md border px-2 text-sm" value={picks[place] ?? ""} onChange={(event) => setPicks({ ...picks, [place]: event.target.value })}>
                                                    <option value="">— nobody —</option>
                                                    {reward.candidates.map((candidate) => (
                                                        <option key={candidate.uid} value={candidate.uid} disabled={!candidate.paid || candidate.banned || candidate.suspicious}>
                                                            #{candidate.rank} {candidate.name} · {candidate.points} pts{!candidate.paid ? " · not paid" : ""}{candidate.banned ? " · banned" : ""}{candidate.suspicious ? " · suspicious" : ""}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        ))}
                                        {reward.candidates.some((candidate) => candidate.banned || candidate.suspicious) ? (
                                            <p className="flex items-center gap-1 text-xs text-amber-700"><ShieldAlert className="h-3.5 w-3.5" />Flagged accounts are excluded until reviewed.</p>
                                        ) : null}
                                        <Button disabled={pickedUids.length === 0 || new Set(pickedUids).size !== pickedUids.length} onClick={() => act({
                                            action: "approve", weekKey: data.weekKey, classLevel: data.classLevel,
                                            winners: Object.entries(picks).filter(([, uid]) => uid).map(([place, uid]) => ({ place: Number(place), uid })),
                                        }, "Winners approved and notified.")}>
                                            <Trophy className="mr-2 h-4 w-4" />Approve winners
                                        </Button>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-base">Previous winners</CardTitle></CardHeader>
                            <CardContent>
                                {data.history.filter((item) => item.status === "approved").length === 0 ? <p className="text-sm text-muted-foreground">No approved winners yet.</p> : (
                                    <ul className="space-y-2 text-sm">
                                        {data.history.filter((item) => item.status === "approved").map((item) => (
                                            <li key={`${item.weekKey}_${item.classLevel}`} className="rounded-lg border p-2">
                                                <p className="text-xs font-semibold text-muted-foreground">Class {item.classLevel} · {item.label ?? item.weekKey}</p>
                                                <p>{item.winners.map((winner) => `${PLACE_LABEL[winner.place]} ${winner.name}${winner.delivered ? " ✓" : ""}`).join(" · ")}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </div>
            ) : null}

            {history ? (
                <Card>
                    <CardHeader className="flex-row items-center justify-between pb-2">
                        <CardTitle className="text-base">Point history · {history.entry.name}</CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => setHistory(null)}>Close</Button>
                    </CardHeader>
                    <CardContent>
                        {history.items.length === 0 ? <p className="text-sm text-muted-foreground">No points recorded yet.</p> : (
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-100"><tr><th className="p-2">When</th><th className="p-2">Week</th><th className="p-2">Kind</th><th className="p-2">Topic</th><th className="p-2">Points</th><th className="p-2">Correct</th></tr></thead>
                                <tbody className="divide-y">
                                    {history.items.map((item) => (
                                        <tr key={item.id}><td className="p-2">{formatDate(item.createdAt)}</td><td className="p-2 font-mono text-xs">{item.weekKey}</td><td className="p-2">{item.kind}</td><td className="p-2">{item.label}</td><td className="p-2 font-semibold">+{item.points}</td><td className="p-2">{item.correctAnswers || ""}</td></tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}

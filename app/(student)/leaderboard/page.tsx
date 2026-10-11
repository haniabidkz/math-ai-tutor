"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { Award, BookOpen, Crown, Medal, Sparkles, Trophy } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAidLanguage } from "@/lib/aid-language";
import { auth } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import type { LocalizedText } from "@/types/curriculum";

interface Entry { uid: string; name: string; points: number; correctAnswers: number; rank: number; me?: boolean }
interface LeaderboardData {
    classLevel: number;
    weekKey: string;
    label: string;
    resetsAt: number;
    participants: number;
    entries: Entry[];
    me: Entry | null;
    previous: { weekKey: string; label: string; participants: number; top: Entry[]; me: Entry | null; winners: Array<{ uid: string; name: string; place: number; me: boolean }> } | null;
    rules: LocalizedText[];
}

const PLACE_STYLES: Record<number, { ring: string; badge: string; label: string }> = {
    1: { ring: "border-amber-300 bg-amber-50", badge: "bg-amber-400 text-amber-950", label: "1st" },
    2: { ring: "border-slate-300 bg-slate-50", badge: "bg-slate-300 text-slate-900", label: "2nd" },
    3: { ring: "border-orange-300 bg-orange-50", badge: "bg-orange-300 text-orange-950", label: "3rd" },
};

function resetsIn(resetsAt: number, ru: boolean): string {
    const hours = Math.max(0, Math.round((resetsAt - Date.now()) / 3_600_000));
    if (hours < 24) return ru ? `${hours} ghante mein reset` : `Resets in ${hours}h`;
    const days = Math.round(hours / 24);
    return ru ? `${days} din mein reset (Monday)` : `Resets in ${days} day${days === 1 ? "" : "s"} (Monday)`;
}

export default function LeaderboardPage() {
    const router = useRouter();
    const [language] = useAidLanguage();
    const ru = language === "roman-urdu";
    const [user, setUser] = useState<User | null>(null);
    const [profile, setProfile] = useState<{ name: string; classLevel?: number }>({ name: "" });
    const [data, setData] = useState<LeaderboardData | null>(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => onAuthStateChanged(auth, async (currentUser) => {
        if (!currentUser) return router.replace("/login?role=student");
        setUser(currentUser);
        try {
            const headers = { Authorization: `Bearer ${await currentUser.getIdToken()}` };
            const [board, progress] = await Promise.all([fetch("/api/leaderboard", { headers }), fetch("/api/progress", { headers })]);
            const boardData = await board.json();
            const progressData = await progress.json().catch(() => ({}));
            if (progressData?.profile) setProfile({ name: progressData.profile.name ?? currentUser.displayName ?? "", classLevel: progressData.profile.classLevel });
            if (!board.ok) throw new Error(boardData.error);
            setData(boardData);
        } catch (caught) {
            setError(caught instanceof Error && caught.message ? caught.message : "The leaderboard could not be loaded.");
        } finally {
            setLoading(false);
        }
    }), [router]);

    const say = (english: string, romanUrdu: string) => (ru ? romanUrdu : english);
    const top = data?.entries.filter((entry) => entry.rank <= 3) ?? [];
    const rest = data?.entries.filter((entry) => entry.rank > 3) ?? [];

    return (
        <DashboardLayout user={{ name: profile.name || user?.displayName || "Student", email: user?.email ?? "", role: "student", classLevel: profile.classLevel }} onSignOut={async () => { await signOut(auth); router.push("/"); }}>
            <PageHeader
                title={data ? say(`Class ${data.classLevel} Leaderboard`, `Class ${data.classLevel} Leaderboard`) : "Leaderboard"}
                description={data ? `${say("Week of", "Hafta")} ${data.label} · ${resetsIn(data.resetsAt, ru)}` : undefined}
                icon={<Trophy className="h-6 w-6" />}
            />
            {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
            {loading ? <p className="py-16 text-center text-muted-foreground">{say("Loading the board...", "Board load ho raha hai...")}</p> : null}

            {data ? (
                <div className="space-y-6">
                    <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-white">
                        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                            <div className="flex items-center gap-4">
                                <div className="flex h-16 w-16 flex-col items-center justify-center rounded-2xl bg-indigo-600 text-white">
                                    <span className="text-[10px] font-extrabold uppercase opacity-90">{say("Rank", "Rank")}</span>
                                    <span className="font-display text-2xl font-bold">{data.me ? `#${data.me.rank}` : "—"}</span>
                                </div>
                                <div>
                                    <p className="font-display text-xl font-semibold">
                                        {data.me
                                            ? say(`You have ${data.me.points} points this week`, `Is hafte tumhare ${data.me.points} points hain`)
                                            : say("No points yet this week", "Is hafte abhi points nahi")}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {data.me
                                            ? say(`${data.me.correctAnswers} correct answers · ${data.participants} ${data.participants === 1 ? "student" : "students"} on the board`, `${data.me.correctAnswers} sahi jawab · board par ${data.participants} students`)
                                            : say("Finish a quiz to appear on the board. Every student competes only with their own class.", "Quiz khatam karo to board par aa jao ge. Har student sirf apni class se muqabla karta hai.")}
                                    </p>
                                </div>
                            </div>
                            <Button asChild><Link href="/learn"><BookOpen className="mr-2 h-4 w-4" />{say("Earn points", "Points kamao")}</Link></Button>
                        </CardContent>
                    </Card>

                    {top.length ? (
                        <section>
                            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold"><Crown className="h-5 w-5 text-amber-500" />{say("Top 3 this week", "Is hafte ke top 3")}</h2>
                            <div className="grid gap-3 sm:grid-cols-3">
                                {top.map((entry) => {
                                    const style = PLACE_STYLES[entry.rank];
                                    return (
                                        <div key={entry.uid} className={cn("flex items-center gap-3 rounded-2xl border-2 p-4", style.ring)}>
                                            <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold", style.badge)}>{style.label}</span>
                                            <div className="min-w-0">
                                                <p className="truncate font-bold">{entry.name}{entry.me ? ` · ${say("you", "tum")}` : ""}</p>
                                                <p className="text-sm text-muted-foreground">{entry.points} {say("points", "points")} · {entry.correctAnswers} {say("correct", "sahi")}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    ) : null}

                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center justify-between text-base">
                                <span>{say("Class standings", "Class ki standing")}</span>
                                <span className="text-xs font-normal text-muted-foreground">{say("Up to 100 shown", "Zyada se zyada 100 dikhte hain")}</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {rest.length === 0 ? (
                                <p className="py-6 text-center text-sm text-muted-foreground">
                                    {data.entries.length === 0
                                        ? say("Nobody has scored yet this week. Be the first!", "Is hafte abhi kisi ne score nahi kiya. Pehle tum bano!")
                                        : say("Only the top 3 have scored so far.", "Abhi sirf top 3 ne score kiya hai.")}
                                </p>
                            ) : (
                                <ol className="divide-y">
                                    {rest.map((entry) => (
                                        <li key={entry.uid} className="flex items-center gap-3 py-2.5 text-sm">
                                            <span className="w-10 shrink-0 font-mono text-muted-foreground">#{entry.rank}</span>
                                            <span className="min-w-0 flex-1 truncate">{entry.name}{entry.me ? ` · ${say("you", "tum")}` : ""}</span>
                                            <span className="font-semibold">{entry.points}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                            {data.me && data.me.rank > data.entries.length ? (
                                <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">{say(`You are #${data.me.rank} of ${data.participants}.`, `Tum ${data.participants} mein se #${data.me.rank} ho.`)}</p>
                            ) : null}
                        </CardContent>
                    </Card>

                    {data.previous ? (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="flex items-center gap-2 text-base"><Medal className="h-5 w-5 text-indigo-600" />{say("Last week", "Pichla hafta")} · {data.previous.label}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                {data.previous.top.length ? (
                                    <ol className="grid gap-2 sm:grid-cols-3">
                                        {data.previous.top.map((entry) => (
                                            <li key={entry.uid} className="flex items-center gap-2 rounded-xl border p-3 text-sm">
                                                <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-extrabold", PLACE_STYLES[entry.rank]?.badge)}>{PLACE_STYLES[entry.rank]?.label ?? entry.rank}</span>
                                                <span className="min-w-0 flex-1 truncate font-semibold">{entry.name}</span>
                                                <span className="text-muted-foreground">{entry.points}</span>
                                            </li>
                                        ))}
                                    </ol>
                                ) : <p className="text-sm text-muted-foreground">{say("Nobody scored last week.", "Pichle hafte kisi ne score nahi kiya.")}</p>}
                                {data.previous.winners.length ? (
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
                                        <p className="flex items-center gap-2 font-bold text-emerald-800"><Award className="h-4 w-4" />{say("Weekly reward winners", "Hafte ke inaam ke winners")}</p>
                                        <p className="mt-1 text-emerald-900">{data.previous.winners.map((winner) => `${PLACE_STYLES[winner.place]?.label ?? winner.place} ${winner.name}${winner.me ? ` (${say("you!", "tum!")})` : ""}`).join(" · ")}</p>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground">{say("Rewards for the top 3 paid members are approved by the admin.", "Top 3 paid members ke inaam admin approve karta hai.")}</p>
                                )}
                                {data.previous.me ? <p className="text-xs text-muted-foreground">{say(`You finished #${data.previous.me.rank} with ${data.previous.me.points} points.`, `Tum #${data.previous.me.rank} rahe, ${data.previous.me.points} points.`)}</p> : null}
                            </CardContent>
                        </Card>
                    ) : null}

                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-5 w-5 text-indigo-600" />{say("How points work", "Points kaise milte hain")}</CardTitle></CardHeader>
                        <CardContent>
                            <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
                                {data.rules.map((rule, index) => <li key={index}>{ru ? rule.romanUrdu : rule.english}</li>)}
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            ) : null}
        </DashboardLayout>
    );
}

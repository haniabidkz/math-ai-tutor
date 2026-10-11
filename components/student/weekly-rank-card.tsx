"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/firebase";

interface Summary { classLevel: number; label: string; participants: number; me: { rank: number; points: number } | null }

/** A one-line view of the student's place on this week's class board, for the dashboard. */
export function WeeklyRankCard() {
    const [summary, setSummary] = useState<Summary | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const current = auth.currentUser;
            if (!current) return;
            try {
                const response = await fetch("/api/leaderboard", { headers: { Authorization: `Bearer ${await current.getIdToken()}` } });
                const data = await response.json();
                if (!cancelled && response.ok) setSummary({ classLevel: data.classLevel, label: data.label, participants: data.participants, me: data.me });
                else if (!cancelled) setFailed(true);
            } catch {
                if (!cancelled) setFailed(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (failed) return null;
    return (
        <Card className="border-amber-200 bg-gradient-to-r from-amber-50 to-white">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-amber-950"><Trophy className="h-5 w-5" /></span>
                    <div>
                        <p className="font-semibold">
                            {!summary ? "Weekly leaderboard" : summary.me
                                ? `You are #${summary.me.rank} in Class ${summary.classLevel} this week with ${summary.me.points} points`
                                : `Class ${summary.classLevel} leaderboard: no points yet this week`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {!summary ? "Loading your rank..." : `Week of ${summary.label} · ${summary.participants} on the board · resets Monday`}
                        </p>
                    </div>
                </div>
                <Button variant="outline" size="sm" asChild><Link href="/leaderboard">View leaderboard<ArrowRight className="ml-1 h-4 w-4" /></Link></Button>
            </CardContent>
        </Card>
    );
}

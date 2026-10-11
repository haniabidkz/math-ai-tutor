"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Trophy, BookOpen, Award, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAidLanguage } from "@/lib/aid-language";
import { auth } from "@/lib/firebase";
import type { StudentNotification } from "@/lib/notifications";
import { cn } from "@/lib/utils";

const ICONS = { content: BookOpen, leaderboard: Trophy, reward: Award };
const REFRESH_MS = 90_000;

function timeAgo(millis: number, ru: boolean): string {
    const minutes = Math.max(0, Math.round((Date.now() - millis) / 60_000));
    if (minutes < 60) return ru ? `${minutes} min pehle` : `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return ru ? `${hours} ghante pehle` : `${hours}h ago`;
    const days = Math.round(hours / 24);
    return ru ? `${days} din pehle` : `${days}d ago`;
}

/** The in-app bell: unread count, a list of notices, read on open. Shown to signed-in students. */
export function NotificationBell({ className }: { className?: string }) {
    const [language] = useAidLanguage();
    const ru = language === "roman-urdu";
    const [items, setItems] = useState<StudentNotification[]>([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const panel = useRef<HTMLDivElement>(null);

    const load = useCallback(async () => {
        const current = auth.currentUser;
        if (!current) return;
        try {
            const response = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${await current.getIdToken()}` } });
            const data = await response.json();
            if (response.ok) {
                setItems(data.items ?? []);
                setUnread(Number(data.unread ?? 0));
                setLoaded(true);
            }
        } catch {
            // The bell simply stays as it was.
        }
    }, []);

    useEffect(() => {
        void load();
        const timer = window.setInterval(() => void load(), REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [load]);

    useEffect(() => {
        if (!open) return;
        const close = (event: MouseEvent) => { if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false); };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    async function toggle() {
        const next = !open;
        setOpen(next);
        if (!next || unread === 0) return;
        // Opening the panel reads everything; the badge clears at once and the server follows.
        setUnread(0);
        setItems((current) => current.map((item) => ({ ...item, read: true })));
        const current = auth.currentUser;
        if (!current) return;
        try {
            await fetch("/api/notifications", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await current.getIdToken()}` }, body: "{}" });
        } catch {
            // Will be retried on the next open.
        }
    }

    return (
        <div ref={panel} className={cn("relative", className)}>
            <Button type="button" variant="outline" size="icon" className="relative h-10 w-10 rounded-full bg-white shadow-sm" onClick={toggle} aria-label={unread ? `${unread} unread notifications` : "Notifications"} aria-expanded={open}>
                <Bell className="h-5 w-5" />
                {unread > 0 ? <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-extrabold text-white">{unread > 9 ? "9+" : unread}</span> : null}
            </Button>
            {open ? (
                <div className="absolute right-0 z-50 mt-2 w-[min(92vw,22rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-label="Notifications">
                    <div className="flex items-center justify-between border-b px-4 py-3">
                        <p className="font-bold">{ru ? "Notifications" : "Notifications"}</p>
                        <button type="button" className="rounded-full p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="Close"><X className="h-4 w-4" /></button>
                    </div>
                    <ul className="max-h-96 divide-y overflow-y-auto">
                        {!loaded ? <li className="px-4 py-6 text-center text-sm text-muted-foreground">{ru ? "Load ho raha hai..." : "Loading..."}</li> : null}
                        {loaded && items.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">{ru ? "Abhi koi notification nahi." : "Nothing here yet."}</li> : null}
                        {items.map((item) => {
                            const Icon = ICONS[item.type] ?? Bell;
                            const content = (
                                <div className="flex gap-3">
                                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", item.type === "reward" ? "bg-emerald-100 text-emerald-700" : item.type === "leaderboard" ? "bg-amber-100 text-amber-700" : "bg-indigo-100 text-indigo-700")}><Icon className="h-4 w-4" /></span>
                                    <div className="min-w-0">
                                        <p className={cn("text-sm", item.read ? "font-semibold" : "font-extrabold")}>{ru ? item.title.romanUrdu : item.title.english}</p>
                                        <p className="text-sm leading-6 text-slate-600">{ru ? item.body.romanUrdu : item.body.english}</p>
                                        <p className="mt-0.5 text-[11px] text-muted-foreground">{timeAgo(item.createdAt, ru)}</p>
                                    </div>
                                </div>
                            );
                            return (
                                <li key={item.id} className={cn("px-4 py-3", !item.read && "bg-indigo-50/60")}>
                                    {item.link ? <Link href={item.link} onClick={() => setOpen(false)} className="block hover:opacity-90">{content}</Link> : content}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            ) : null}
        </div>
    );
}

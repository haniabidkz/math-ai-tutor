import Link from "next/link";
import { BookOpen, CheckCircle2, ChevronRight, LockKeyhole } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import type { LocalizedText } from "@/types/curriculum";

export interface ActiveTopic {
    microTag: string;
    title: LocalizedText;
    topicTitle: LocalizedText;
    mastered: boolean;
    locked: boolean;
    percentage: number;
}

/**
 * The five topics a learner should focus on now. Students get links into the lesson;
 * parents see the same list read-only.
 */
export function ActiveTopicList({
    topics,
    classLevel,
    linkable = true,
}: {
    topics: ActiveTopic[];
    classLevel: number;
    linkable?: boolean;
}) {
    return (
        <ol className="grid gap-2">
            {topics.map((topic, index) => {
                const status = topic.mastered ? "Mastered" : topic.locked ? "Unlocks after the previous topic" : topic.percentage > 0 ? "In progress" : "Ready to learn";
                const row = (
                    <div className={`flex items-center gap-3 rounded-lg border p-3 ${topic.locked ? "bg-slate-50 opacity-70" : "bg-white"} ${linkable && !topic.locked ? "transition hover:border-indigo-300 hover:bg-indigo-50/40" : ""}`}>
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{index + 1}</span>
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100">
                            {topic.mastered ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                : topic.locked ? <LockKeyhole className="h-4 w-4 text-slate-500" />
                                    : <BookOpen className="h-4 w-4 text-indigo-600" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{topic.title.english}</p>
                            <p className="text-xs text-muted-foreground">{topic.topicTitle.english} · {status}</p>
                            <Progress value={topic.mastered ? 100 : topic.percentage} className="mt-1.5 h-1" aria-label={`${topic.title.english} ${topic.percentage}%`} />
                        </div>
                        {linkable && !topic.locked ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                    </div>
                );
                return (
                    <li key={topic.microTag}>
                        {linkable && !topic.locked
                            ? <Link href={`/learn?microTag=${topic.microTag}&class=${classLevel}`}>{row}</Link>
                            : row}
                    </li>
                );
            })}
        </ol>
    );
}

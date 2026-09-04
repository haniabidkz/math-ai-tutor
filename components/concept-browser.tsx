"use client";

import Link from "next/link";
import { BookOpen, CheckCircle2, ChevronRight, LockKeyhole } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { Locale, LocalizedText, MicroConcept } from "@/types/curriculum";

export interface BrowsableConcept extends MicroConcept {
    mastered: boolean;
    percentage: number;
    locked: boolean;
}

export interface BrowsableTopic {
    topicId: string;
    title: LocalizedText;
    concepts: BrowsableConcept[];
}

const copy = {
    english: { mastered: "mastered", ready: "Ready to learn", locked: "Complete the prerequisite first" },
    "roman-urdu": { mastered: "mukammal", ready: "Seekhna shuru karein", locked: "Pehle pichla concept mukammal karein" },
};

/** Shared concept list used by the dashboard and by /learn when no concept is chosen. */
export function ConceptBrowser({
    topics,
    classLevel,
    locale,
}: {
    topics: BrowsableTopic[];
    classLevel: number;
    locale: Locale;
}) {
    const t = copy[locale];
    const localize = (value: LocalizedText) => (locale === "roman-urdu" ? value.romanUrdu : value.english);

    return (
        <section className="space-y-6">
            {topics.map((topic) => {
                const masteredCount = topic.concepts.filter((concept) => concept.mastered).length;
                const percent = topic.concepts.length ? Math.round((masteredCount / topic.concepts.length) * 100) : 0;
                return (
                    <div key={topic.topicId}>
                        <div className="mb-2 flex items-center justify-between">
                            <h2 className="text-lg font-semibold">{localize(topic.title)}</h2>
                            <Badge variant="outline">{masteredCount}/{topic.concepts.length} {t.mastered}</Badge>
                        </div>
                        <Progress value={percent} className="mb-3 h-1.5" aria-label={`${localize(topic.title)} ${percent}%`} />
                        <div className="grid gap-3 md:grid-cols-2">
                            {topic.concepts.map((concept) => {
                                const card = (
                                    <Card className={`rounded-md border-l-4 ${concept.mastered ? "border-l-emerald-500" : concept.locked ? "border-l-slate-300 opacity-65" : "border-l-indigo-500"}`}>
                                        <CardContent className="flex min-h-24 items-center gap-4 p-4">
                                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100">
                                                {concept.mastered ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                                                    : concept.locked ? <LockKeyhole className="h-5 w-5 text-slate-500" />
                                                        : <BookOpen className="h-5 w-5 text-indigo-600" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h3 className="font-semibold">{localize(concept.title)}</h3>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {concept.mastered ? `${concept.percentage}% ${t.mastered}` : concept.locked ? t.locked : t.ready}
                                                </p>
                                            </div>
                                            {!concept.locked ? <ChevronRight className="h-5 w-5 text-muted-foreground" /> : null}
                                        </CardContent>
                                    </Card>
                                );
                                return concept.locked
                                    ? <div key={concept.microTag}>{card}</div>
                                    : (
                                        <Link key={concept.microTag} href={`/learn?microTag=${concept.microTag}&class=${classLevel}`}>
                                            {card}
                                        </Link>
                                    );
                            })}
                        </div>
                    </div>
                );
            })}
        </section>
    );
}

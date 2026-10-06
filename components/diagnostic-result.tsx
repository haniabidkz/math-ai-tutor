import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DiagnosticSummary } from "@/lib/diagnostic-summary";

const BAND_STYLES: Record<string, string> = {
    strong: "bg-emerald-100 text-emerald-800",
    "needs-practice": "bg-amber-100 text-amber-800",
    weak: "bg-orange-100 text-orange-800",
    "very-weak": "bg-rose-100 text-rose-800",
};

/**
 * The diagnostic test result, shown to parents and teachers exactly as the student saw it:
 * the score, the maths level it placed the student at, and the five areas with their bands.
 */
export function DiagnosticResultCard({ summary, studentName }: { summary: DiagnosticSummary | null; studentName?: string }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-indigo-600" />Diagnostic test</CardTitle>
            </CardHeader>
            <CardContent>
                {!summary ? (
                    <p className="text-sm text-muted-foreground">{studentName ?? "The student"} has not taken the diagnostic test yet.</p>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Score</p>
                                <p className="text-3xl font-bold">{summary.correct} / {summary.total} <span className="text-base font-medium text-muted-foreground">({summary.accuracyPercent}%)</span></p>
                            </div>
                            <Badge className={`border-0 ${BAND_STYLES[summary.band] ?? ""}`}>{summary.bandLabel.english}</Badge>
                        </div>
                        <dl className="grid gap-3 text-sm sm:grid-cols-3">
                            <div><dt className="text-muted-foreground">Enrolled class</dt><dd className="font-semibold">Class {summary.assessedClassLevel}</dd></div>
                            <div><dt className="text-muted-foreground">Maths level found</dt><dd className="font-semibold">Class {summary.mathLevel}</dd></div>
                            <div><dt className="text-muted-foreground">Weakest area</dt><dd className="font-semibold">{summary.weakTopic?.english ?? "No major weakness"}</dd></div>
                        </dl>
                        {summary.topics.length ? (
                            <div className="grid gap-2 sm:grid-cols-5">
                                {summary.topics.map((topic) => (
                                    <div key={topic.key} className="rounded-lg border p-2.5">
                                        <p className="text-xs font-semibold leading-snug">{topic.title.english}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">{topic.correct} / {topic.total}</p>
                                        <span className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${BAND_STYLES[topic.band] ?? ""}`}>{topic.bandLabel.english}</span>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                        {summary.recommendedTopic ? (
                            <p className="text-xs text-muted-foreground">Recommended starting topic: <span className="font-medium text-foreground">{summary.recommendedTopic.english}</span></p>
                        ) : null}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

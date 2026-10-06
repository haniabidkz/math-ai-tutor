import { OVERALL_BAND_LABELS, TOPIC_BAND_LABELS, type OverallBand, type TopicBand } from "@/lib/diagnostic-blueprint";
import type { DiagnosticProfile } from "@/types/assessment";
import type { LocalizedText } from "@/types/curriculum";

/** The diagnostic result as parents and teachers see it: the same figures the student saw. */
export interface DiagnosticSummary {
    assessedClassLevel: number;
    mathLevel: number;
    correct: number;
    total: number;
    accuracyPercent: number;
    band: OverallBand;
    bandLabel: LocalizedText;
    weakTopic: LocalizedText | null;
    recommendedTopic: LocalizedText | null;
    topics: Array<{ key: string; title: LocalizedText; correct: number; total: number; band: TopicBand; bandLabel: LocalizedText }>;
}

const isBand = (value: unknown): value is TopicBand => typeof value === "string" && value in TOPIC_BAND_LABELS;

/** Null until the student has taken the test; tolerant of results saved by older versions. */
export function toDiagnosticSummary(profile: Partial<DiagnosticProfile> | null | undefined): DiagnosticSummary | null {
    if (!profile || typeof profile.overallTotal !== "number" || profile.overallTotal <= 0) return null;
    const correct = Number(profile.overallCorrect ?? 0);
    const total = profile.overallTotal;
    const band: OverallBand = profile.overallBand && profile.overallBand in OVERALL_BAND_LABELS ? profile.overallBand : correct / total >= 0.8 ? "strong" : correct / total >= 0.5 ? "needs-practice" : "weak";
    return {
        assessedClassLevel: Number(profile.assessedClassLevel ?? 0),
        mathLevel: Number(profile.mathLevel ?? profile.assessedClassLevel ?? 0),
        correct,
        total,
        accuracyPercent: typeof profile.accuracyPercent === "number" ? profile.accuracyPercent : Math.round((correct / total) * 100),
        band,
        bandLabel: OVERALL_BAND_LABELS[band],
        weakTopic: profile.weakTopic ?? null,
        recommendedTopic: profile.recommendedTopic ?? null,
        topics: (profile.topicResults ?? []).map((topic, index) => {
            const topicBand: TopicBand = isBand(topic.band) ? topic.band : "weak";
            return {
                key: topic.topicKey ?? String(index),
                title: topic.title,
                correct: Number(topic.correct ?? 0),
                total: Number(topic.total ?? 0),
                band: topicBand,
                bandLabel: TOPIC_BAND_LABELS[topicBand],
            };
        }),
    };
}

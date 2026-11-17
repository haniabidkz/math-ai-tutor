import { findForeignContext } from "@/lib/ai-studio/context-check";
import type { ReadQuestion } from "@/lib/ai-studio/schema";
import { findNearCopy, questionSignature } from "@/lib/ai-studio/similarity";
import type { DraftQuestion, GenerationStep } from "@/lib/ai-studio/types";
import { questionRomanUrduProblems } from "@/lib/ai-studio/urdu-check";
import { brevityIssues, normalizeText } from "@/lib/ai-studio/validate";

/** How many questions a step still needs: earlier replies may have given some already. */
export const stillNeeded = (step: Pick<GenerationStep, "count" | "kept">) => Math.max(1, (step.count ?? 0) - (step.kept ?? 0));

/**
 * Rule A (short questions, no repeats) and the other content rules, checked question by
 * question: a good question is kept and only the broken ones are written again with the
 * reasons, so one slip no longer throws away the whole reply.
 */
export function keepGoodQuestions(
    read: ReadQuestion[],
    context: {
        /** Questions still needed by the step. */
        count: number;
        /** Live questions and questions already in the draft, which nothing may repeat. */
        existing: string[];
        /** Sub-topic and main-topic pools: the micro-topics this batch was given, one per question. */
        focus: string[];
        countProblem: string | null;
    },
): { kept: DraftQuestion[]; refused: string[] } {
    const seen = new Set(context.existing.map(normalizeText));
    const poolTexts = [...context.existing];
    const poolSignatures = context.existing.map((text) => questionSignature(text));
    const openFocus = [...context.focus];
    const kept: DraftQuestion[] = [];
    const refused: string[] = [];
    read.forEach(({ question, problems }, index) => {
        if (kept.length >= context.count) return;
        const label = `question ${index + 1}`;
        const own = [...problems];
        const foreign = findForeignContext(question.questionText, ...question.options, question.hint.english, question.solution.english);
        if (foreign.length) own.push(`${label} uses a foreign setting (${foreign.join(", ")}); use Pakistani daily life, Rupees and kilometres`);
        for (const issue of brevityIssues(question)) {
            if (issue.severity === "error") own.push(`${label}: ${issue.message}`);
        }
        own.push(...questionRomanUrduProblems(label, question));
        const text = normalizeText(question.questionText);
        if (seen.has(text)) own.push(`${label} repeats an existing question`);
        else {
            const copied = findNearCopy(text, poolSignatures);
            if (copied >= 0) own.push(`${label} is almost the same as an earlier question ("${poolTexts[copied].slice(0, 80)}"); change the idea or situation, not just the numbers`);
        }
        // Sub-topic and main-topic pools stay evenly spread: each kept question takes one of the micro-topics given.
        if (context.focus.length && !openFocus.includes(question.microTag)) {
            own.push(`${label} must be about one of these micro-topics: ${[...new Set(openFocus)].join(", ")}`);
        }
        if (own.length) {
            refused.push(...own);
            return;
        }
        if (context.focus.length) openFocus.splice(openFocus.indexOf(question.microTag), 1);
        kept.push(question);
        seen.add(text);
        poolTexts.push(question.questionText);
        poolSignatures.push(questionSignature(text));
    });
    if (kept.length < context.count && context.countProblem) refused.unshift(context.countProblem);
    return { kept, refused };
}

/**
 * Batches written at the same time cannot see each other, so just before saving, a question
 * that repeats one saved meanwhile is dropped and written again.
 */
export function dropRepeats(kept: DraftQuestion[], saved: DraftQuestion[]): { kept: DraftQuestion[]; refused: string[] } {
    const seen = new Set(saved.map((question) => normalizeText(question.questionText)));
    const signatures = saved.map((question) => questionSignature(question.questionText));
    const refused: string[] = [];
    const left = kept.filter((question) => {
        const text = normalizeText(question.questionText);
        if (seen.has(text) || findNearCopy(text, signatures) >= 0) {
            refused.push(`"${question.questionText.slice(0, 80)}" is almost the same as a question written at the same time; write a different idea`);
            return false;
        }
        seen.add(text);
        signatures.push(questionSignature(text));
        return true;
    });
    return { kept: left, refused };
}

/**
 * The step after a reply: done when it has everything it needs; still open, with the good
 * questions counted, when part of the reply was kept; failed when nothing could be used.
 */
export function settleStep(
    step: GenerationStep,
    reply: { ok: boolean; kept: number; refused: string[]; error: string },
): { step: GenerationStep; finished: boolean; progressed: boolean } {
    const base: GenerationStep = { id: step.id, kind: step.kind, difficulty: step.difficulty, count: step.count, status: "pending", attempts: step.attempts + 1 };
    const wanted = step.kind === "questions" ? stillNeeded(step) : 0;
    if (reply.ok && (step.kind === "concept" || reply.kept >= wanted)) return { step: { ...base, status: "done" }, finished: true, progressed: false };
    if (step.kind === "questions" && reply.kept > 0) {
        return {
            step: {
                ...base,
                kept: (step.kept ?? 0) + reply.kept,
                feedback: [`${reply.kept} question(s) of your last reply were kept; write ${wanted - reply.kept} new one(s) that avoid these problems`, ...reply.refused],
            },
            finished: false,
            progressed: true,
        };
    }
    // Keep earlier feedback when the failure was the connection, not the content.
    return {
        step: { ...base, ...(step.kept ? { kept: step.kept } : {}), status: "failed", error: reply.error, feedback: reply.refused.length ? reply.refused : step.feedback },
        finished: false,
        progressed: false,
    };
}

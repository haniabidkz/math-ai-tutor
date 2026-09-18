import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { findForeignContext } from "@/lib/ai-studio/context-check";
import { AiError, completeJson } from "@/lib/ai-studio/ai";
import { conceptPrompt, questionPrompt } from "@/lib/ai-studio/prompts";
import { conceptSchema, normalizeConcept, normalizeQuestionBatch, questionBatchSchema } from "@/lib/ai-studio/schema";
import {
    assertOpen, clean, draftFrom, draftsCollection, liveQuestionTexts,
    studioErrorResponse, StudioError, toClientDraft,
} from "@/lib/ai-studio/store";
import type { DraftConcept, DraftQuestion, GenerationDraft, GenerationStep } from "@/lib/ai-studio/types";
import { normalizeText } from "@/lib/ai-studio/validate";
import { requireSuperAdmin } from "@/lib/server-auth";

export const maxDuration = 300;

/** A step still marked running after this long was cut off by the time limit. */
const STALE_AFTER_MS = 320_000;

/** Longest wait for one model, leaving time for a backup model inside the 300-second limit. */
const PER_MODEL_MS = 150_000;

const bodySchema = z.object({ stepId: z.string().min(1) });

type Outcome =
    | { ok: true; concept?: DraftConcept; questions?: DraftQuestion[] }
    | { ok: false; problems: string[]; error: string };

async function runStep(draft: GenerationDraft, step: GenerationStep) {
    const tags = draft.target.microTopics.map((topic) => topic.microTag);

    if (step.kind === "concept") {
        const prompt = conceptPrompt(draft);
        const reply = await completeJson<unknown>({ role: "generation", ...prompt, schemaName: "concept_explanation", schema: conceptSchema, temperature: 0.6, maxOutputTokens: 16_000, timeoutMs: PER_MODEL_MS });
        const { concept, problems } = normalizeConcept(reply.data);
        const foreign = concept ? findForeignContext(concept.explanation.english, concept.example.english) : [];
        if (foreign.length) problems.push(`the explanation uses a foreign setting (${foreign.join(", ")}); use Pakistani daily life, Rupees and kilometres`);
        const outcome: Outcome = concept && !problems.length ? { ok: true, concept } : { ok: false, problems, error: "The explanation was incomplete" };
        return { outcome, usage: reply.usage };
    }

    const difficulty = step.difficulty!;
    const count = step.count!;
    const existing = [...await liveQuestionTexts(tags), ...draft.questions.map((question) => question.questionText)];
    const prompt = questionPrompt(draft, { difficulty, count, avoid: existing, feedback: step.feedback });
    // Questions think hard: a first run at the default effort put a wrong answer or no right
    // option in 2 of 10 hard questions. The extra thinking costs little.
    const reply = await completeJson<unknown>({
        role: "generation", ...prompt, schemaName: "question_pool", schema: questionBatchSchema(tags),
        temperature: 0.6, maxOutputTokens: 48_000, timeoutMs: PER_MODEL_MS, reasoningEffort: "high",
    });
    const { questions, problems } = normalizeQuestionBatch(reply.data, { difficulty, count, allowedTags: tags });

    // Rule A and no repeats: the whole batch is redone with the reasons, never patched up.
    const seen = new Set(existing.map(normalizeText));
    questions.forEach((question, index) => {
        const foreign = findForeignContext(question.questionText, ...question.options, question.hint.english, question.solution.english);
        if (foreign.length) problems.push(`question ${index + 1} uses a foreign setting (${foreign.join(", ")}); use Pakistani daily life, Rupees and kilometres`);
        const text = normalizeText(question.questionText);
        if (seen.has(text)) problems.push(`question ${index + 1} repeats an existing question`);
        seen.add(text);
    });

    const outcome: Outcome = problems.length
        ? { ok: false, problems, error: `The reply broke ${problems.length} rule(s)` }
        : { ok: true, questions };
    return { outcome, usage: reply.usage };
}

/**
 * Runs one step of the plan: the concept, or one small batch of questions of one
 * difficulty. The browser calls this once per step, so no request nears the time limit.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await requireSuperAdmin(request);
        const { id } = await context.params;
        const { stepId } = bodySchema.parse(await request.json());
        const ref = draftsCollection().doc(id);
        const lockedAt = Date.now();

        const locked = await adminDb.runTransaction(async (transaction) => {
            const draft = draftFrom(await transaction.get(ref));
            assertOpen(draft);
            const step = draft.steps.find((item) => item.id === stepId);
            if (!step) throw new StudioError(404, "That step is not part of this draft.");
            if (step.status === "done") return { draft, step, skip: true };
            if (step.status === "running" && lockedAt - (step.startedAt ?? 0) < STALE_AFTER_MS) {
                throw new StudioError(409, "This step is already running. Wait for it to finish.");
            }
            const steps = draft.steps.map((item) => (item.id === stepId ? { ...item, status: "running" as const, startedAt: lockedAt } : item));
            transaction.update(ref, { steps: clean(steps), updatedAt: FieldValue.serverTimestamp() });
            return { draft, step, skip: false };
        });
        if (locked.skip) return NextResponse.json({ success: true, draft: toClientDraft(locked.draft) });

        let outcome: Outcome;
        let usage = { inputTokens: 0, outputTokens: 0 };
        let aiCode: string | undefined;
        try {
            ({ outcome, usage } = await runStep(locked.draft, locked.step));
        } catch (error) {
            const failure = error instanceof AiError ? error : new AiError("failed", error instanceof Error ? error.message : "Generation failed");
            aiCode = failure.code;
            outcome = { ok: false, problems: [], error: failure.message };
        }

        const saved = await adminDb.runTransaction(async (transaction) => {
            const draft = draftFrom(await transaction.get(ref));
            const current = draft.steps.find((item) => item.id === stepId);
            // Another request took over a step that looked stuck; its result wins.
            if (!current || current.status !== "running" || current.startedAt !== lockedAt || draft.status !== "generating") return draft;

            const steps: GenerationStep[] = draft.steps.map((item) => {
                if (item.id !== stepId) return item;
                const base = { id: item.id, kind: item.kind, difficulty: item.difficulty, count: item.count, attempts: item.attempts + 1 };
                return outcome.ok
                    ? { ...base, status: "done" as const }
                    // Keep earlier feedback when the failure was the connection, not the content.
                    : { ...base, status: "failed" as const, error: outcome.error, feedback: outcome.problems.length ? outcome.problems : item.feedback };
            });
            const changes: Partial<GenerationDraft> = { steps };
            if (outcome.ok && outcome.concept) changes.concept = outcome.concept;
            if (outcome.ok && outcome.questions) changes.questions = [...draft.questions, ...outcome.questions];
            if (steps.every((item) => item.status === "done")) changes.status = "needs_review";

            transaction.update(ref, {
                ...clean(changes),
                "usage.calls": FieldValue.increment(aiCode ? 0 : 1),
                "usage.inputTokens": FieldValue.increment(usage.inputTokens),
                "usage.outputTokens": FieldValue.increment(usage.outputTokens),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { ...draft, ...changes };
        });

        if (!outcome.ok) {
            return NextResponse.json(
                { success: false, error: outcome.error, problems: outcome.problems, code: aiCode ?? "rejected", draft: toClientDraft(saved) },
                { status: aiCode ? 502 : 422 },
            );
        }
        return NextResponse.json({ success: true, draft: toClientDraft(saved) });
    } catch (error) {
        return studioErrorResponse(error, "The step could not run");
    }
}

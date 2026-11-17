import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { findForeignContext } from "@/lib/ai-studio/context-check";
import { AiError, completeJson } from "@/lib/ai-studio/ai";
import { batchFocus, conceptPrompt, questionPrompt } from "@/lib/ai-studio/prompts";
import { checkWorkedExample } from "@/lib/ai-studio/worked-check";
import { dropRepeats, keepGoodQuestions, settleStep, stillNeeded } from "@/lib/ai-studio/batch-keep";
import { conceptSchemaFor, normalizeConcept, questionBatchSchema, readQuestionBatch } from "@/lib/ai-studio/schema";
import {
    assertOpen, clean, draftFrom, draftsCollection, liveQuestionTexts,
    studioErrorResponse, StudioError, toClientDraft,
} from "@/lib/ai-studio/store";
import { withHelp, type DraftConcept, type DraftQuestion, type GenerationDraft, type GenerationStep } from "@/lib/ai-studio/types";
import { romanUrduProblems } from "@/lib/ai-studio/urdu-check";
import { requireSuperAdmin } from "@/lib/server-auth";

export const maxDuration = 300;

/** A step still marked running after this long was cut off by the time limit. */
const STALE_AFTER_MS = 320_000;

/** Longest wait for one model, leaving time for a backup model inside the 300-second limit. */
const PER_MODEL_MS = 150_000;

/**
 * Short, clean questions need little thinking, so easy ones come back fast; hard ones keep a
 * high effort because the first hard batches had wrong answers at the default effort.
 */
const REASONING_BY_DIFFICULTY = { easy: "low", medium: "medium", hard: "high" } as const;

const bodySchema = z.object({
    stepId: z.string().min(1),
    /** Take over a step still marked running, when the admin says its earlier request is dead. */
    force: z.boolean().optional(),
});

/** `refused` lists why the questions not kept from a partly good reply were refused. */
type Outcome =
    | { ok: true; concept?: DraftConcept; questions?: DraftQuestion[]; refused?: string[] }
    | { ok: false; problems: string[]; error: string };

async function runStep(draft: GenerationDraft, step: GenerationStep) {
    const tags = draft.target.microTopics.map((topic) => topic.microTag);
    // Micro-topic pools teach; sub-topic and main-topic pools only mark, so they get no lesson, hints or solutions.
    const help = withHelp(draft.level);

    if (step.kind === "concept") {
        const prompt = conceptPrompt(draft, step.feedback);
        const reply = await completeJson<unknown>({ role: "generation", ...prompt, schemaName: help ? "concept_explanation" : "pool_boundary", schema: conceptSchemaFor(draft.level), temperature: 0.6, maxOutputTokens: 16_000, timeoutMs: PER_MODEL_MS });
        const { concept, problems } = normalizeConcept(reply.data, help);
        const foreign = concept && help ? findForeignContext(concept.explanation.english, concept.example.english, concept.workedExample?.problem.english ?? "") : [];
        if (foreign.length) problems.push(`the explanation uses a foreign setting (${foreign.join(", ")}); use Pakistani daily life, Rupees and kilometres`);
        if (concept && help) {
            problems.push(...romanUrduProblems("the explanation", concept.explanation.romanUrdu), ...romanUrduProblems("the real-life example", concept.example.romanUrdu));
            for (const step of concept.workedExample?.steps ?? []) problems.push(...romanUrduProblems("the worked example", step.text.romanUrdu));
        }
        let usage = reply.usage;
        // A second model solves the worked example; a wrong one is written again with the reason.
        if (concept?.workedExample && help && !problems.length) {
            try {
                const check = await checkWorkedExample(concept.workedExample);
                usage = { inputTokens: usage.inputTokens + check.usage.inputTokens, outputTokens: usage.outputTokens + check.usage.outputTokens };
                if (check.matches) concept.workedExample = { ...concept.workedExample, check: { status: "agrees" } };
                else problems.push(`the worked example is wrong: an independent solve got "${check.answer.slice(0, 120)}"${check.note ? ` (${check.note.slice(0, 200)})` : ""}; work every step and the final answer out again`);
            } catch (error) {
                console.error("The worked example could not be checked", error);
                concept.workedExample = { ...concept.workedExample, check: { status: "error", note: "The automatic check could not run." } };
            }
        }
        const outcome: Outcome = concept && !problems.length ? { ok: true, concept } : { ok: false, problems, error: "The explanation was incomplete" };
        return { outcome, usage };
    }

    const difficulty = step.difficulty!;
    const count = stillNeeded(step);
    const live = await liveQuestionTexts(tags);
    const inDraft = draft.questions.map((question) => question.questionText);
    // The lock reserved the micro-topics for this run, so batches running at the same time spread out.
    const focus = step.focus ?? batchFocus(draft, count);
    // Each question must name one covered skill, so it cannot leave the written scope.
    const skills = draft.concept?.scope?.covers ?? [];
    const prompt = questionPrompt(draft, { difficulty, count, avoid: [...live, ...inDraft], feedback: step.feedback, focus });
    const reply = await completeJson<unknown>({
        role: "generation", ...prompt, schemaName: "question_pool", schema: questionBatchSchema(tags, skills, help),
        temperature: 0.6, maxOutputTokens: 48_000, timeoutMs: PER_MODEL_MS, reasoningEffort: REASONING_BY_DIFFICULTY[difficulty],
    });
    const { read, countProblem } = readQuestionBatch(reply.data, { difficulty, count, allowedTags: tags, skills, withHelp: help });

    const { kept, refused } = keepGoodQuestions(read, { count, existing: [...live, ...inDraft], focus, countProblem });

    const outcome: Outcome = kept.length
        ? { ok: true, questions: kept, refused }
        : { ok: false, problems: refused.length ? refused : [countProblem ?? "no questions came back"], error: `The reply broke ${Math.max(1, refused.length)} rule(s)` };
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
        const { stepId, force = false } = bodySchema.parse(await request.json());
        const ref = draftsCollection().doc(id);
        const lockedAt = Date.now();

        const locked = await adminDb.runTransaction(async (transaction) => {
            const draft = draftFrom(await transaction.get(ref));
            assertOpen(draft);
            const step = draft.steps.find((item) => item.id === stepId);
            if (!step) throw new StudioError(404, "That step is not part of this draft.");
            if (step.status === "done") return { draft, step, skip: true };
            // A forced request takes the step over at once; if the earlier request ever finishes,
            // the startedAt check in the save below drops its result.
            if (step.status === "running" && !force && lockedAt - (step.startedAt ?? 0) < STALE_AFTER_MS) {
                throw new StudioError(409, "This step is already running. Wait for it to finish.", { code: "running", startedAt: step.startedAt ?? null });
            }
            // Sub-topic and main-topic pools: batches running at the same time each take the
            // micro-topics with the fewest questions, counting what the others are already writing.
            const reserved = draft.steps
                .filter((item) => item.id !== stepId && item.status === "running" && lockedAt - (item.startedAt ?? 0) < STALE_AFTER_MS)
                .flatMap((item) => item.focus ?? []);
            const focus = step.kind === "questions" ? batchFocus(draft, stillNeeded(step), reserved) : [];
            const running: GenerationStep = { ...step, status: "running", startedAt: lockedAt, focus: focus.length ? focus : undefined };
            const steps = draft.steps.map((item) => (item.id === stepId ? running : item));
            transaction.update(ref, { steps: clean(steps), updatedAt: FieldValue.serverTimestamp() });
            return { draft, step: running, skip: false };
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
            if (!current || current.status !== "running" || current.startedAt !== lockedAt || draft.status !== "generating") {
                return { draft, failed: !outcome.ok, error: outcome.ok ? "" : outcome.error, problems: outcome.ok ? [] : outcome.problems, kept: 0 };
            }

            const fresh = outcome.ok ? dropRepeats(outcome.questions ?? [], draft.questions) : { kept: [], refused: [] };
            const kept = fresh.kept;
            const refused = outcome.ok ? [...(outcome.refused ?? []), ...fresh.refused] : outcome.problems;
            const error = outcome.ok ? `The reply broke ${Math.max(1, refused.length)} rule(s)` : outcome.error;
            const settled = settleStep(current, { ok: outcome.ok, kept: kept.length, refused, error });
            const steps: GenerationStep[] = draft.steps.map((item) => (item.id === stepId ? settled.step : item));
            const changes: Partial<GenerationDraft> = { steps };
            if (outcome.ok && outcome.concept) changes.concept = outcome.concept;
            if (kept.length) changes.questions = [...draft.questions, ...kept];
            if (steps.every((item) => item.status === "done")) changes.status = "needs_review";

            transaction.update(ref, {
                ...clean(changes),
                "usage.calls": FieldValue.increment(aiCode ? 0 : 1),
                "usage.inputTokens": FieldValue.increment(usage.inputTokens),
                "usage.outputTokens": FieldValue.increment(usage.outputTokens),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { draft: { ...draft, ...changes }, failed: !settled.finished && !settled.progressed, error, problems: refused, kept: kept.length };
        });

        if (saved.failed) {
            return NextResponse.json(
                { success: false, error: saved.error, problems: saved.problems, code: aiCode ?? "rejected", draft: toClientDraft(saved.draft) },
                { status: aiCode ? 502 : 422 },
            );
        }
        // A partly kept reply is progress, not a failure: the step stays open for the rest.
        return NextResponse.json({ success: true, kept: saved.kept, refused: saved.problems, draft: toClientDraft(saved.draft) });
    } catch (error) {
        return studioErrorResponse(error, "The step could not run");
    }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { checkBatchSize, completeJson } from "@/lib/ai-studio/ai";
import { checkerTopic, verificationPrompt } from "@/lib/ai-studio/prompts";
import { verificationSchema } from "@/lib/ai-studio/schema";
import {
    assertOpen, clean, draftFrom, draftsCollection, loadDraft,
    studioErrorResponse, toClientDraft,
} from "@/lib/ai-studio/store";
import { verificationFromAnswer, type CheckerAnswer } from "@/lib/ai-studio/check";
import type { DraftQuestion } from "@/lib/ai-studio/types";
import { questionFingerprint } from "@/lib/ai-studio/validate";
import { requireSuperAdmin } from "@/lib/server-auth";

export const maxDuration = 300;

const bodySchema = z.object({
    /** Only these questions; without it, the first unchecked ones. */
    keys: z.array(z.string().min(1).max(80)).max(20).optional(),
});

/** A check that errored is repeated only when the admin asks ("Check again"), so it cannot loop. */
const needsCheck = (question: DraftQuestion) =>
    question.verification.status === "pending" &&
    question.questionText.trim().length > 0 &&
    question.options.every((option) => option.trim().length > 0);

/**
 * A second, independent solve: a reasoning model from another service answers a batch of
 * unchecked questions without seeing the marked answer. Any disagreement blocks approval
 * until a person decides.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await requireSuperAdmin(request);
        const { id } = await context.params;
        // Checks running at the same time each name their own questions, so no answer is checked twice.
        const { keys } = bodySchema.parse(await request.json().catch(() => ({})));
        const ref = draftsCollection().doc(id);
        const draft = await loadDraft(id);
        assertOpen(draft);

        const batch = draft.questions.filter((question) => needsCheck(question) && (!keys || keys.includes(question.key))).slice(0, checkBatchSize());
        if (!batch.length) {
            return NextResponse.json({ success: true, checked: 0, remaining: draft.questions.filter(needsCheck).length, draft: toClientDraft(draft) });
        }

        // Short ids keep the reply small and easy to match back. Each question carries its
        // micro-topic and the written boundary, so the checker also says whether it stays inside.
        const reply = await completeJson<{ answers: CheckerAnswer[] }>({
            role: "verification",
            ...verificationPrompt(
                batch.map((question, index) => ({ ...question, key: `q${index + 1}`, topic: checkerTopic(draft, question.microTag) })),
                draft.level,
            ),
            schemaName: "independent_solve",
            schema: verificationSchema,
            maxOutputTokens: 30_000,
            timeoutMs: 120_000,
            // The check is the safety net for wrong answers, so it thinks harder than the writer.
            reasoningEffort: "high",
        });
        const answers = new Map((reply.data.answers ?? []).map((answer) => [answer.id, answer]));
        const sent = new Map(batch.map((question, index) => [question.key, { fingerprint: questionFingerprint(question), answer: answers.get(`q${index + 1}`) }]));

        const saved = await adminDb.runTransaction(async (transaction) => {
            const latest = draftFrom(await transaction.get(ref));
            assertOpen(latest);
            const questions = latest.questions.map((question): DraftQuestion => {
                const entry = sent.get(question.key);
                // Skip questions deleted, edited or confirmed while the check was running.
                if (!entry || !needsCheck(question) || questionFingerprint(question) !== entry.fingerprint) return question;
                return { ...question, verification: verificationFromAnswer(question, entry.answer, entry.fingerprint) };
            });
            transaction.update(ref, {
                questions: clean(questions),
                "usage.calls": FieldValue.increment(1),
                "usage.inputTokens": FieldValue.increment(reply.usage.inputTokens),
                "usage.outputTokens": FieldValue.increment(reply.usage.outputTokens),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { ...latest, questions };
        });

        return NextResponse.json({
            success: true,
            checked: batch.length,
            remaining: saved.questions.filter(needsCheck).length,
            draft: toClientDraft(saved),
        });
    } catch (error) {
        return studioErrorResponse(error, "The answers could not be checked");
    }
}

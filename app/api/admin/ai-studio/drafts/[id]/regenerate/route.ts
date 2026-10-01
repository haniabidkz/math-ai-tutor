import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { rewriteQuestion } from "@/lib/ai-studio/regenerate";
import {
    assertOpen, clean, draftFrom, draftsCollection, liveQuestionTexts, loadDraft,
    studioErrorResponse, StudioError, toClientDraft,
} from "@/lib/ai-studio/store";
import { REWRITE_REASON_KEYS, type DraftQuestion } from "@/lib/ai-studio/types";
import { requireSuperAdmin } from "@/lib/server-auth";

export const maxDuration = 300;

const bodySchema = z.object({
    key: z.string().min(1).max(80),
    reason: z.enum(REWRITE_REASON_KEYS),
    note: z.string().max(300).optional(),
});

/**
 * Rewrites one question of a draft in place: the AI writes a replacement that fixes the
 * flagged problem and the checker solves it again, so the card comes back already checked.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await requireSuperAdmin(request);
        const { id } = await context.params;
        const { key, reason, note } = bodySchema.parse(await request.json());
        const ref = draftsCollection().doc(id);
        const draft = await loadDraft(id);
        assertOpen(draft);
        const original = draft.questions.find((question) => question.key === key);
        if (!original) throw new StudioError(404, "That question is no longer in this draft.");

        const live = await liveQuestionTexts(draft.target.microTopics.map((topic) => topic.microTag));
        const others = draft.questions.filter((question) => question.key !== key).map((question) => question.questionText);
        const outcome = await rewriteQuestion({ context: draft, original, reason, note, avoid: [...live, ...others] });

        const saved = await adminDb.runTransaction(async (transaction) => {
            const latest = draftFrom(await transaction.get(ref));
            assertOpen(latest);
            if (!latest.questions.some((question) => question.key === key)) {
                throw new StudioError(409, "This question was removed while it was being rewritten.");
            }
            // The replacement keeps the card's place and key, so open editors and filters still match it.
            const replacement: DraftQuestion = { ...outcome.question, key, origin: "ai" };
            const questions = latest.questions.map((question) => (question.key === key ? replacement : question));
            transaction.update(ref, {
                questions: clean(questions),
                "usage.calls": FieldValue.increment(outcome.usage.calls),
                "usage.inputTokens": FieldValue.increment(outcome.usage.inputTokens),
                "usage.outputTokens": FieldValue.increment(outcome.usage.outputTokens),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { ...latest, questions };
        });

        return NextResponse.json({ success: true, passed: outcome.passed, draft: toClientDraft(saved) });
    } catch (error) {
        return studioErrorResponse(error, "The question could not be regenerated");
    }
}

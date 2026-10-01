import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { toQuestionBankItem } from "@/lib/ai-studio/publish";
import { asRewriteOriginal, liveRewriteContext, rewriteQuestion } from "@/lib/ai-studio/regenerate";
import { allConcepts, clean, draftsCollection, liveQuestionTexts, studioErrorResponse, StudioError } from "@/lib/ai-studio/store";
import { REWRITE_REASON_KEYS, REWRITE_REASONS, type DraftConcept, type GenerationDraft } from "@/lib/ai-studio/types";
import { requireSuperAdmin } from "@/lib/server-auth";
import type { QuestionBankItem } from "@/types/curriculum";

export const maxDuration = 300;

const bodySchema = z.object({
    reason: z.enum(REWRITE_REASON_KEYS),
    note: z.string().max(300).optional(),
});

/** The owner's diagnostic tests keep their exact wording, so they are never rewritten by AI. */
const DIAGNOSTIC_FIXED = "Diagnostic test questions are fixed tests and are never regenerated. You can still edit them by hand.";

/** The latest regenerated version of each question, waiting for the Super Admin to accept it. */
const rewrites = () => adminDb.collection("questionRewrites");

/** The written boundary of the micro-topic pool a question came from, when there was one. */
async function poolBoundary(draftId: string | undefined): Promise<DraftConcept | null> {
    if (!draftId) return null;
    try {
        const snapshot = await draftsCollection().doc(draftId).get();
        const draft = snapshot.data() as GenerationDraft | undefined;
        return draft?.level === "micro" && draft.concept ? draft.concept : null;
    } catch {
        return null;
    }
}

/**
 * Writes a corrected version of a live question and checks it, without changing anything yet.
 * The admin sees the new version and replaces the question with PUT.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const admin = await requireSuperAdmin(request);
        const { id } = await context.params;
        const { reason, note } = bodySchema.parse(await request.json());
        const snapshot = await adminDb.collection("questions").doc(id).get();
        if (!snapshot.exists) throw new StudioError(404, "This question no longer exists.");
        const question = { ...snapshot.data(), id } as QuestionBankItem & { aiDraftId?: string };
        if (question.purpose === "diagnostic") throw new StudioError(409, DIAGNOSTIC_FIXED);

        const concepts = await allConcepts();
        const concept = concepts.find((item) => item.microTag === question.microTag);
        if (!concept) throw new StudioError(409, `The micro-topic ${question.microTag} no longer exists, so this question cannot be regenerated.`);
        const [poolConcept, live] = await Promise.all([poolBoundary(question.aiDraftId), liveQuestionTexts([question.microTag])]);

        const outcome = await rewriteQuestion({
            context: liveRewriteContext(concept, concepts, poolConcept),
            original: asRewriteOriginal(question),
            reason,
            note,
            avoid: live,
        });
        const { id: _id, ...item } = toQuestionBankItem(outcome.question, {
            id,
            microTag: question.microTag,
            prerequisiteTag: question.prerequisiteTag ?? concept.prerequisiteTag ?? null,
            classLevel: question.classLevel,
        });
        await rewrites().doc(id).set({
            ...clean({ questionId: id, item, verification: outcome.question.verification, passed: outcome.passed, reason, note: note ?? "" }),
            basedOnVersion: Number(question.version ?? 1),
            createdBy: admin.uid,
            createdAt: FieldValue.serverTimestamp(),
        });
        return NextResponse.json({ success: true, passed: outcome.passed, candidate: { ...item, id }, verification: outcome.question.verification });
    } catch (error) {
        return studioErrorResponse(error, "The question could not be regenerated");
    }
}

/** Replaces the live question with its regenerated version; only a version the checker agreed with. */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const admin = await requireSuperAdmin(request);
        const { id } = await context.params;
        const questionRef = adminDb.collection("questions").doc(id);
        const rewriteRef = rewrites().doc(id);

        const result = await adminDb.runTransaction(async (transaction) => {
            const [questionSnapshot, rewriteSnapshot] = await Promise.all([transaction.get(questionRef), transaction.get(rewriteRef)]);
            if (!questionSnapshot.exists) throw new StudioError(404, "This question no longer exists.");
            if (!rewriteSnapshot.exists) throw new StudioError(409, "Regenerate the question first.");
            const current = questionSnapshot.data() ?? {};
            const rewrite = rewriteSnapshot.data() ?? {};
            if (current.purpose === "diagnostic") throw new StudioError(409, DIAGNOSTIC_FIXED);
            if (rewrite.passed !== true) {
                throw new StudioError(409, "The answer check did not agree with this version, so it cannot replace the question. Regenerate it again.");
            }
            const version = Number(current.version ?? 1);
            if (version !== Number(rewrite.basedOnVersion)) throw new StudioError(409, "This question was changed after it was regenerated. Regenerate it again.");

            const item = rewrite.item as Omit<QuestionBankItem, "id">;
            // The question keeps its id, status and history; only its content is replaced.
            const data = {
                ...item,
                status: current.status ?? item.status,
                source: current.source ?? item.source,
                version: version + 1,
                regeneratedAt: FieldValue.serverTimestamp(),
                regeneratedBy: admin.uid,
                updatedBy: admin.uid,
                updatedAt: FieldValue.serverTimestamp(),
            };
            transaction.set(questionRef, data, { mergeFields: Object.keys(data) });
            transaction.delete(rewriteRef);
            return { version: version + 1, reason: String(rewrite.reason ?? "") };
        });

        const why = REWRITE_REASONS[result.reason as keyof typeof REWRITE_REASONS]?.label ?? "flagged";
        await writeAuditLog({
            actorUid: admin.uid, actorEmail: admin.email, action: "question.regenerate", targetType: "question", targetId: id,
            summary: `Replaced ${id} with an AI-regenerated, checked version (${why})`,
        });
        return NextResponse.json({ success: true, version: result.version });
    } catch (error) {
        return studioErrorResponse(error, "The question could not be replaced");
    }
}

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { approveSchema } from "@/lib/ai-studio/input";
import { aiQuestionId, newConceptFromDraft, toQuestionBankItem } from "@/lib/ai-studio/publish";
import {
    allConcepts, draftFrom, draftsCollection, liveQuestionTexts, loadDraft,
    studioErrorResponse, StudioError,
} from "@/lib/ai-studio/store";
import { NEW_MICRO_TAG } from "@/lib/ai-studio/types";
import { blockingIssues, normalizeText, validateDraft } from "@/lib/ai-studio/validate";
import { requireSuperAdmin } from "@/lib/server-auth";
import type { MicroConcept } from "@/types/curriculum";

const same = (english: string) => ({ english, romanUrdu: english });

/**
 * Rule C, the final gate: runs every check again on the saved draft, then writes the lesson
 * and all questions to the live database in one transaction, so nothing goes live half-done.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const admin = await requireSuperAdmin(request);
        const { id } = await context.params;
        const { replaceLesson = false } = approveSchema.parse(await request.json().catch(() => ({})));
        const ref = draftsCollection().doc(id);

        const preview = await loadDraft(id);
        const tags = preview.target.microTopics.map((topic) => topic.microTag);
        const [liveTexts, concepts] = await Promise.all([liveQuestionTexts(tags), allConcepts()]);
        const liveSet = new Set(liveTexts.map(normalizeText));
        const conceptByTag = new Map(concepts.map((concept) => [concept.microTag, concept]));

        const result = await adminDb.runTransaction(async (transaction) => {
            const draft = draftFrom(await transaction.get(ref));
            if (draft.status === "approved") throw new StudioError(409, "This draft is already live.");
            if (draft.status !== "needs_review") throw new StudioError(409, "Finish generating every step before approving.");
            const issues = blockingIssues(validateDraft(draft, liveSet));
            if (issues.length) throw new StudioError(422, `${issues.length} problem(s) must be fixed before approval.`, issues);

            const { target } = draft;
            const creating = draft.level === "micro" && !target.microTopic?.microTag;
            const newConcept = creating ? newConceptFromDraft(draft, concepts) : null;
            const tagFor = (tag: string) => (tag === NEW_MICRO_TAG ? newConcept!.microTag : tag);

            // Concepts this approval changes: a new micro-topic, or an existing one's lesson or sub-topic label.
            const touched = newConcept
                ? [newConcept.microTag]
                : draft.level === "micro" && (replaceLesson || target.subTopic) ? [target.microTopic!.microTag!]
                    : draft.level === "sub" ? tags : [];
            const snapshots = await Promise.all(touched.map((tag) => transaction.get(adminDb.collection("microConcepts").doc(tag))));

            // All reads are done; writes follow.
            const stamp = { updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() };
            if (newConcept) {
                if (snapshots[0].exists) throw new StudioError(409, `A micro-topic with the tag ${newConcept.microTag} was just created. Approve again.`);
                transaction.set(snapshots[0].ref, { ...newConcept, foundationOnly: false, aiDraftId: draft.id, createdBy: admin.uid, createdAt: FieldValue.serverTimestamp(), ...stamp });
            } else {
                for (const snapshot of snapshots) {
                    // Bundled concepts not yet copied to Firestore are written in full, never as a fragment.
                    const base: Partial<MicroConcept> = snapshot.exists ? {} : { ...conceptByTag.get(snapshot.id) };
                    const change: Partial<MicroConcept> = {
                        ...(draft.level === "micro" && replaceLesson ? { concept: draft.concept!.explanation, example: draft.concept!.example } : {}),
                        ...(target.subTopic ? { subTopic: same(target.subTopic) } : {}),
                    };
                    transaction.set(snapshot.ref, { ...base, ...change, ...stamp }, { merge: true });
                }
            }

            const ids: string[] = [];
            for (const question of draft.questions) {
                const microTag = tagFor(question.microTag);
                const prerequisiteTag = newConcept && microTag === newConcept.microTag
                    ? newConcept.prerequisiteTag
                    : conceptByTag.get(microTag)?.prerequisiteTag ?? null;
                const { id: questionId, ...item } = toQuestionBankItem(question, {
                    id: aiQuestionId(microTag, randomUUID()), microTag, prerequisiteTag, classLevel: target.classLevel,
                });
                ids.push(questionId);
                transaction.set(adminDb.collection("questions").doc(questionId), {
                    ...item, aiDraftId: draft.id, createdBy: admin.uid, createdAt: FieldValue.serverTimestamp(), ...stamp,
                });
            }

            transaction.update(ref, {
                status: "approved",
                approvedAt: FieldValue.serverTimestamp(),
                approvedBy: admin.uid,
                publishedMicroTag: newConcept?.microTag ?? target.microTopic?.microTag ?? null,
                publishedQuestionIds: ids,
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { ids, microTag: newConcept?.microTag ?? null, name: target.microTopic?.title ?? target.subTopic ?? target.chapter.title, level: draft.level };
        });

        await writeAuditLog({
            actorUid: admin.uid, actorEmail: admin.email, action: "aiStudio.draft.approve", targetType: "generationDraft", targetId: id,
            summary: `Pushed ${result.ids.length} AI questions for ${result.name} (${result.level}-topic) to the live bank${result.microTag ? `, new micro-topic ${result.microTag}` : ""}`,
        });
        return NextResponse.json({ success: true, questionIds: result.ids, microTag: result.microTag });
    } catch (error) {
        return studioErrorResponse(error, "The draft could not be pushed live");
    }
}

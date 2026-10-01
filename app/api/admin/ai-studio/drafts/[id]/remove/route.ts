import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { draftsCollection, loadDraft, studioErrorResponse, StudioError } from "@/lib/ai-studio/store";
import { LEVEL_LABELS } from "@/lib/ai-studio/quotas";
import { requireSuperAdmin } from "@/lib/server-auth";

/**
 * Takes an approved AI pool, such as a whole-chapter dump, off the live bank: every question it
 * published that is still there is deleted, a micro-topic it created is archived so students no
 * longer see an empty lesson, and the draft leaves the Studio. Only questions carrying this
 * draft's id are touched, so diagnostic tests and other content stay exactly as they are.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        const admin = await requireSuperAdmin(request);
        const { id } = await context.params;
        const draft = await loadDraft(id);
        if (draft.status === "generating" || draft.status === "needs_review") {
            throw new StudioError(409, "This draft is not live. Use Discard draft instead.");
        }

        const snapshot = await adminDb.collection("questions").where("aiDraftId", "==", id).get();
        const doomed = snapshot.docs.filter((doc) => doc.data().purpose !== "diagnostic");
        for (let start = 0; start < doomed.length; start += 400) {
            const batch = adminDb.batch();
            for (const doc of doomed.slice(start, start + 400)) batch.delete(doc.ref);
            await batch.commit();
        }

        let archived: string | null = null;
        if (draft.publishedMicroTag) {
            const conceptRef = adminDb.collection("microConcepts").doc(draft.publishedMicroTag);
            const concept = await conceptRef.get();
            if (concept.exists && concept.data()?.aiDraftId === id && concept.data()?.status !== "archived") {
                await conceptRef.update({ status: "archived", updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() });
                archived = draft.publishedMicroTag;
            }
        }

        await draftsCollection().doc(id).delete();
        const name = draft.target.microTopic?.title ?? draft.target.subTopic ?? draft.target.chapter.title;
        await writeAuditLog({
            actorUid: admin.uid, actorEmail: admin.email, action: "aiStudio.draft.remove", targetType: "generationDraft", targetId: id,
            summary: `Removed the ${LEVEL_LABELS[draft.level].toLowerCase()} for ${name} (Class ${draft.target.classLevel}): deleted ${doomed.length} live question(s)`
                + `${archived ? `, archived micro-topic ${archived}` : ""}`,
        });
        return NextResponse.json({ success: true, removed: doomed.length, archivedMicroTag: archived });
    } catch (error) {
        return studioErrorResponse(error, "The pool could not be removed");
    }
}

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { draftsCollection, studioErrorResponse } from "@/lib/ai-studio/store";
import { requireSuperAdmin } from "@/lib/server-auth";

/**
 * Clears the Studio's working area: every unfinished draft is discarded, so only new requests
 * produce content. Approved drafts stay as history, and nothing live (questions, lessons or
 * the diagnostic tests) is touched.
 */
export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const open = await draftsCollection().where("status", "in", ["generating", "needs_review"]).get();
        for (let start = 0; start < open.docs.length; start += 400) {
            const batch = adminDb.batch();
            for (const doc of open.docs.slice(start, start + 400)) {
                batch.update(doc.ref, { status: "discarded", discardedReason: "cleared", updatedAt: FieldValue.serverTimestamp() });
            }
            await batch.commit();
        }
        if (open.size) {
            await writeAuditLog({
                actorUid: admin.uid, actorEmail: admin.email, action: "aiStudio.drafts.clear", targetType: "generationDraft",
                targetId: open.docs.slice(0, 20).map((doc) => doc.id).join(","), summary: `Cleared ${open.size} unfinished AI Studio draft(s)`,
            });
        }
        return NextResponse.json({ success: true, cleared: open.size });
    } catch (error) {
        return studioErrorResponse(error, "The drafts could not be cleared");
    }
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export const maxDuration = 60;

const bodySchema = z.object({
    ids: z.array(z.string().trim().min(1).max(200)).min(1, "Select at least one question").max(5000, "Delete at most 5000 questions at a time"),
});

/** Firestore allows 500 writes per batch; stay well below it. */
const BATCH_SIZE = 400;

/**
 * Deletes many questions in one request. Diagnostic test questions are always skipped, and
 * students' past sessions keep their own copies of the questions they answered.
 */
export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
            return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
        }
        const requested = [...new Set(parsed.data.ids)];
        const deletable: string[] = [];
        let skipped = 0;
        for (let start = 0; start < requested.length; start += BATCH_SIZE) {
            const refs = requested.slice(start, start + BATCH_SIZE).map((id) => adminDb.collection("questions").doc(id));
            const snapshots = await adminDb.getAll(...refs);
            const batch = adminDb.batch();
            snapshots.forEach((snapshot, index) => {
                if (snapshot.data()?.purpose === "diagnostic") {
                    skipped += 1;
                    return;
                }
                deletable.push(refs[index].id);
                batch.delete(refs[index]);
            });
            await batch.commit();
        }
        if (deletable.length) {
            const shown = deletable.slice(0, 20).join(",");
            await writeAuditLog({
                actorUid: admin.uid,
                actorEmail: admin.email,
                action: "questions.bulkDelete",
                targetType: "question",
                targetId: deletable.length > 20 ? `${shown},…` : shown,
                summary: `Deleted ${deletable.length} question(s)${skipped ? `; kept ${skipped} diagnostic test question(s)` : ""}`,
            });
        }
        return NextResponse.json({ success: true, deleted: deletable.length, skippedDiagnostic: skipped });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "The questions could not be deleted" }, { status: 500 });
    }
}

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { conceptInputSchema } from "@/lib/admin-schemas";
import { writeAuditLog } from "@/lib/admin-audit";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";
import type { MicroConcept } from "@/types/curriculum";

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const snapshot = await adminDb.collection("microConcepts").get();
        const concepts = snapshot.docs
            .map((doc) => ({ ...doc.data(), microTag: doc.id }) as MicroConcept)
            .sort((left, right) => left.classLevel - right.classLevel || left.topicId.localeCompare(right.topicId) || left.order - right.order);
        return NextResponse.json({ success: true, concepts });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to load concepts" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const parsed = conceptInputSchema.parse(await request.json());
        if (parsed.prerequisiteTag === parsed.microTag) return NextResponse.json({ success: false, error: "A concept cannot require itself" }, { status: 400 });
        await adminDb.collection("microConcepts").doc(parsed.microTag).set({ ...parsed, createdBy: admin.uid, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: "concept.upsert", targetType: "microConcept", targetId: parsed.microTag, summary: `Saved ${parsed.title.english}` });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: error?.issues?.[0]?.message ?? "Invalid concept" }, { status: 400 });
    }
}

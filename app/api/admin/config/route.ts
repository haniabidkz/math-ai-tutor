import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { effectiveConfig, validateConfigInput } from "@/lib/config-validation";
import { writeAuditLog } from "@/lib/admin-audit";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";
import type { AssessmentConfig } from "@/types/curriculum";

const configRef = () => adminDb.collection("assessmentConfigs").doc("default");

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const doc = await configRef().get();
        return NextResponse.json({ success: true, config: effectiveConfig(doc.data() as Partial<AssessmentConfig> | undefined) });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to load config" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const result = validateConfigInput(await request.json());
        if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 400 });

        await configRef().set({ ...result.config, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: "config.update", targetType: "assessmentConfig", targetId: "default", summary: "Updated assessment settings" });

        // Read back what was stored, so the screen shows exactly what persisted.
        const saved = await configRef().get();
        return NextResponse.json({ success: true, config: effectiveConfig(saved.data() as Partial<AssessmentConfig> | undefined) });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to update config" }, { status: 500 });
    }
}

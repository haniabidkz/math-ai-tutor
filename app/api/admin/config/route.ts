import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { DEFAULT_ASSESSMENT_CONFIG } from "@/types/curriculum";
import { writeAuditLog } from "@/lib/admin-audit";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const doc = await adminDb.collection("assessmentConfigs").doc("default").get();
        return NextResponse.json({ success: true, config: doc.exists ? doc.data() : DEFAULT_ASSESSMENT_CONFIG });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to load config" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const body = await request.json();
        const config = {
            diagnosticQuestionCount: Math.max(20, Math.min(25, Number(body.diagnosticQuestionCount))),
            masteryQuestionCount: Math.max(5, Math.min(10, Number(body.masteryQuestionCount))),
            weeklyQuestionCount: Math.max(5, Math.min(10, Number(body.weeklyQuestionCount))),
            weeklyIntervalDays: Math.max(1, Number(body.weeklyIntervalDays)),
            masteryThresholdPercent: Math.max(50, Math.min(100, Number(body.masteryThresholdPercent))),
            scoreCorrect: 1,
            scoreHint: -0.5,
            scoreIncorrect: -1,
        };
        await adminDb.collection("assessmentConfigs").doc("default").set({ ...config, updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: "config.update", targetType: "assessmentConfig", targetId: "default", summary: "Updated assessment settings" });
        return NextResponse.json({ success: true, config });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to update config" }, { status: 500 });
    }
}

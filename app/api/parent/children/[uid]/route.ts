import { NextRequest, NextResponse } from "next/server";
import { buildChildReport } from "@/lib/child-report";
import { adminDb } from "@/lib/firebase-admin";
import { isParentOf } from "@/lib/learner-metrics";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

/** Full progress for one child, only when the child's profile names this parent. */
export async function GET(request: NextRequest, context: { params: Promise<{ uid: string }> }) {
    try {
        const user = await requireUser(request, ["parent"]);
        const { uid } = await context.params;
        if (!uid || uid.includes("/")) return NextResponse.json({ success: false, error: "Child not found" }, { status: 404 });

        const student = await adminDb.collection("students").doc(uid).get();
        // A missing child and someone else's child look the same, so neither leaks existence.
        if (!student.exists || !isParentOf(user.email, student.data()?.parentEmail)) {
            return NextResponse.json({ success: false, error: "Child not found" }, { status: 404 });
        }

        const child = await buildChildReport(uid, true);
        if (!child) return NextResponse.json({ success: false, error: "Child not found" }, { status: 404 });
        return NextResponse.json({ success: true, child });
    } catch (error) {
        console.error("Parent child detail error", error);
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load this child's progress" }, { status: 500 });
    }
}

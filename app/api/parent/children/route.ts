import { NextRequest, NextResponse } from "next/server";
import { buildChildReport } from "@/lib/child-report";
import { adminDb } from "@/lib/firebase-admin";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

/** Every child whose profile names this parent's email, with headline progress. */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["parent"]);
        const email = user.email.trim();
        if (!email) return NextResponse.json({ success: false, error: "Your account has no email address" }, { status: 400 });

        const parentSnapshot = await adminDb.collection("parents").doc(user.uid).get();
        const candidates = [...new Set([email, email.toLowerCase()])];
        const snapshot = await adminDb.collection("students").where("parentEmail", "in", candidates).get();
        const children = (await Promise.all(snapshot.docs.map((doc) => buildChildReport(doc.id, false)))).filter(Boolean);

        return NextResponse.json({
            success: true,
            parent: { name: String(parentSnapshot.data()?.name ?? user.email), email },
            children,
        });
    } catch (error) {
        console.error("Parent children error", error);
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load your children" }, { status: 500 });
    }
}

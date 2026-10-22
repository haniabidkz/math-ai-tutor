import { NextRequest, NextResponse } from "next/server";
import { buildChildReport } from "@/lib/child-report";
import { adminDb } from "@/lib/firebase-admin";
import { formatPhone, isPhoneEmail } from "@/lib/phone";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

/** Every child whose profile names this parent's email, with headline progress. */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["parent"]);
        // A child names the parent by email or by phone; both are matched.
        const email = isPhoneEmail(user.email) ? "" : user.email.trim();
        const phone = user.phone;
        if (!email && !phone) return NextResponse.json({ success: false, error: "Your account has no email address or phone number" }, { status: 400 });

        const parentSnapshot = await adminDb.collection("parents").doc(user.uid).get();
        const candidates = [...new Set([email, email.toLowerCase()].filter(Boolean))];
        const [byEmail, byPhone] = await Promise.all([
            candidates.length ? adminDb.collection("students").where("parentEmail", "in", candidates).get() : null,
            phone ? adminDb.collection("students").where("parentPhone", "==", phone).get() : null,
        ]);
        const ids = [...new Set([...(byEmail?.docs ?? []), ...(byPhone?.docs ?? [])].map((doc) => doc.id))];
        const children = (await Promise.all(ids.map((uid) => buildChildReport(uid, false)))).filter(Boolean);

        return NextResponse.json({
            success: true,
            parent: { name: String(parentSnapshot.data()?.name ?? user.email), email: email || formatPhone(phone) },
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

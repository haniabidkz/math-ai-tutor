import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const email = request.nextUrl.searchParams.get("email");
        const records = email ? [await adminAuth.getUserByEmail(email)] : (await adminAuth.listUsers(200)).users;
        return NextResponse.json({ success: true, users: records.map((user) => ({ uid: user.uid, email: user.email, displayName: user.displayName, emailVerified: user.emailVerified, disabled: user.disabled, role: user.customClaims?.role, superAdmin: user.customClaims?.super_admin === true })) });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to load users" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const { uid, action, value } = await request.json();
        if (!uid || !action) return NextResponse.json({ success: false, error: "uid and action are required" }, { status: 400 });
        if (uid === admin.uid && action === "disable") return NextResponse.json({ success: false, error: "You cannot disable your own account" }, { status: 400 });
        if (action === "disable") await adminAuth.updateUser(uid, { disabled: Boolean(value) });
        else if (action === "revoke") await adminAuth.revokeRefreshTokens(uid);
        else if (action === "class") await adminDb.collection("students").doc(uid).update({ class: Number(value) });
        else return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: `user.${action}`, targetType: "user", targetId: uid, summary: `${action}: ${String(value ?? true)}` });
        return NextResponse.json({ success: true });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to update user" }, { status: 500 });
    }
}

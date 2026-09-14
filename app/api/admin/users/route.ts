import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const email = request.nextUrl.searchParams.get("email");
        const records = email ? [await adminAuth.getUserByEmail(email)] : (await adminAuth.listUsers(200)).users;

        // Teachers created through sign-up have a profile but no role claim, so read it too.
        const teacherSnapshots = records.length
            ? await adminDb.getAll(...records.map((user) => adminDb.collection("teachers").doc(user.uid)))
            : [];
        const teachers = new Map(teacherSnapshots.filter((doc) => doc.exists).map((doc) => [doc.id, doc.data() ?? {}]));

        return NextResponse.json({
            success: true,
            users: records.map((user) => {
                const teacher = teachers.get(user.uid);
                return {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    emailVerified: user.emailVerified,
                    disabled: user.disabled,
                    role: user.customClaims?.role ?? (teacher ? "teacher" : undefined),
                    superAdmin: user.customClaims?.super_admin === true,
                    isTeacher: Boolean(teacher) || user.customClaims?.role === "teacher",
                    assignedClasses: Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses : [],
                };
            }),
        });
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

        let summary = `${action}: ${String(value ?? true)}`;
        if (action === "disable") await adminAuth.updateUser(uid, { disabled: Boolean(value) });
        else if (action === "revoke") await adminAuth.revokeRefreshTokens(uid);
        else if (action === "class") await adminDb.collection("students").doc(uid).update({ class: Number(value) });
        else if (action === "assignedClasses") {
            const classes = Array.isArray(value)
                ? [...new Set(value.map(Number))].filter((level) => level === 6 || level === 7 || level === 8).sort()
                : null;
            if (!classes) return NextResponse.json({ success: false, error: "Assigned classes must be a list of 6, 7 or 8" }, { status: 400 });
            await adminDb.collection("teachers").doc(uid).set({ assignedClasses: classes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            summary = `assigned classes: ${classes.length ? classes.join(", ") : "none"}`;
        } else return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });

        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: `user.${action}`, targetType: "user", targetId: uid, summary });
        return NextResponse.json({ success: true });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to update user" }, { status: 500 });
    }
}

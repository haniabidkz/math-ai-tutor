import { NextRequest, NextResponse } from "next/server";
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { failure } from "@/lib/api-response";
import { setMembership } from "@/lib/leaderboard-server";
import { displayContact } from "@/lib/phone";
import { generatePassword } from "@/lib/schools";
import { deleteStudentAccount, listSchools } from "@/lib/schools-server";
import { requireSuperAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 1000;
const CHUNK = 100;

async function profiles(collection: string, uids: string[]): Promise<Map<string, DocumentData>> {
    const found = new Map<string, DocumentData>();
    for (let start = 0; start < uids.length; start += CHUNK) {
        const refs = uids.slice(start, start + CHUNK).map((uid) => adminDb.collection(collection).doc(uid));
        const docs = await adminDb.getAll(...refs);
        for (const doc of docs) if (doc.exists) found.set(doc.id, doc.data() ?? {});
    }
    return found;
}

/** Every account with its role, school, class and plan, with filters by school, role and text. */
export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const params = request.nextUrl.searchParams;
        const email = params.get("email");
        const schoolFilter = params.get("school");
        const roleFilter = params.get("role");
        const query = params.get("q")?.trim().toLowerCase() ?? "";
        const records = email ? [await adminAuth.getUserByEmail(email)] : (await adminAuth.listUsers(LIST_LIMIT)).users;
        const uids = records.map((user) => user.uid);

        // Sign-up profiles carry no role claim, so each role collection is read too.
        const [students, teachers, parents, schoolAdmins, schools] = await Promise.all([
            profiles("students", uids), profiles("teachers", uids), profiles("parents", uids), profiles("schoolAdmins", uids), listSchools(),
        ]);
        const schoolName = new Map(schools.map((school) => [school.id, school.name]));

        const users = records.map((user) => {
            const student = students.get(user.uid);
            const teacher = teachers.get(user.uid);
            const parent = parents.get(user.uid);
            const schoolAdmin = schoolAdmins.get(user.uid);
            const profile = student ?? teacher ?? parent ?? schoolAdmin ?? null;
            const superAdmin = user.customClaims?.super_admin === true;
            const role = superAdmin ? "super_admin" : student ? "student" : teacher ? "teacher" : parent ? "parent" : schoolAdmin ? "school_admin" : (user.customClaims?.role as string | undefined);
            const schoolId = typeof profile?.schoolId === "string" && profile.schoolId ? profile.schoolId : null;
            return {
                uid: user.uid,
                email: user.email,
                phone: user.phoneNumber ?? (typeof profile?.phone === "string" ? profile.phone : null),
                contact: displayContact({ email: typeof profile?.email === "string" && profile.email ? profile.email : user.email, phone: user.phoneNumber ?? profile?.phone }),
                displayName: user.displayName ?? (typeof profile?.name === "string" ? profile.name : undefined),
                emailVerified: user.emailVerified,
                disabled: user.disabled,
                role,
                superAdmin,
                isTeacher: Boolean(teacher) || user.customClaims?.role === "teacher",
                assignedClasses: Array.isArray(teacher?.assignedClasses) ? teacher.assignedClasses : [],
                schoolId,
                schoolName: schoolId ? schoolName.get(schoolId) ?? schoolId : null,
                classLevel: student ? Number(student.class) || null : null,
                sectionLabel: typeof student?.sectionLabel === "string" ? student.sectionLabel : null,
                paid: student ? student.membership?.paid !== false : null,
                schoolStatus: student?.schoolStatus === "graduated" ? "graduated" : student ? "active" : null,
                createdAt: user.metadata.creationTime ?? null,
            };
        }).filter((user) => {
            if (schoolFilter === "none" && user.schoolId) return false;
            if (schoolFilter && schoolFilter !== "none" && user.schoolId !== schoolFilter) return false;
            if (roleFilter && user.role !== roleFilter) return false;
            if (query && !`${user.displayName ?? ""} ${user.email ?? ""} ${user.phone ?? ""} ${user.contact}`.toLowerCase().includes(query)) return false;
            return true;
        });

        return NextResponse.json({ success: true, users, schools: schools.map((school) => ({ id: school.id, name: school.name, code: school.code })) });
    } catch (error) {
        return failure(error, "Failed to load users");
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const { uid, action, value } = await request.json();
        if (!uid || !action) return NextResponse.json({ success: false, error: "uid and action are required" }, { status: 400 });
        if (uid === admin.uid && ["disable", "delete"].includes(action)) return NextResponse.json({ success: false, error: "You cannot change your own account here" }, { status: 400 });

        let summary = `${action}: ${String(value ?? true)}`;
        let password: string | null = null;
        if (action === "disable") {
            await adminAuth.updateUser(uid, { disabled: Boolean(value) });
            if (value) await adminAuth.revokeRefreshTokens(uid);
        } else if (action === "revoke") await adminAuth.revokeRefreshTokens(uid);
        else if (action === "class") await adminDb.collection("students").doc(uid).update({ class: Number(value) });
        else if (action === "assignedClasses") {
            const classes = Array.isArray(value)
                ? [...new Set(value.map(Number))].filter((level) => level === 6 || level === 7 || level === 8).sort()
                : null;
            if (!classes) return NextResponse.json({ success: false, error: "Assigned classes must be a list of 6, 7 or 8" }, { status: 400 });
            await adminDb.collection("teachers").doc(uid).set({ assignedClasses: classes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            summary = `assigned classes: ${classes.length ? classes.join(", ") : "none"}`;
        } else if (action === "paid") {
            await setMembership(uid, value === true, admin);
            return NextResponse.json({ success: true });
        } else if (action === "resetPassword") {
            password = typeof value === "string" && value.length >= 6 ? value : generatePassword();
            await adminAuth.updateUser(uid, { password });
            await adminAuth.revokeRefreshTokens(uid);
            summary = "password reset";
        } else if (action === "delete") {
            await deleteStudentAccount(uid, admin);
            return NextResponse.json({ success: true });
        } else return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });

        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: `user.${action}`, targetType: "user", targetId: uid, summary });
        return NextResponse.json({ success: true, password });
    } catch (error) {
        return failure(error, "Failed to update user");
    }
}

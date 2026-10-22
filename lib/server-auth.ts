import type { NextRequest } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { assertSuperAdminClaims, AuthorizationError, CROSS_TENANT_CODE, SCHOOL_SUSPENDED_CODE } from "@/lib/auth-claims";
import { recordActivity } from "@/lib/analytics-server";
import { isPhoneEmail } from "@/lib/phone";
import { getSchool } from "@/lib/schools-server";
import type { School } from "@/types/school";
import type { UserRole } from "@/types/user";

export interface AuthenticatedUser {
    uid: string;
    /** The real email when the account has one; otherwise the phone sign-in email. */
    email: string;
    phone: string | null;
    role: UserRole;
    superAdmin: boolean;
    /** Null for individual accounts and for the super admin. */
    schoolId: string | null;
    /** The role document (students/teachers/parents/schoolAdmins); null for the super admin. */
    profile: DocumentData | null;
    school: School | null;
}

const ROLE_COLLECTIONS = {
    student: "students",
    parent: "parents",
    teacher: "teachers",
    school_admin: "schoolAdmins",
} as const;

type ProfileRole = keyof typeof ROLE_COLLECTIONS;

export function collectionForRole(role: ProfileRole): (typeof ROLE_COLLECTIONS)[ProfileRole] {
    return ROLE_COLLECTIONS[role];
}

function bearerToken(request: NextRequest) {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new AuthorizationError(401, "Authentication required");
    return header.slice(7);
}

/**
 * Firebase rejects expired or malformed tokens with its own error type. Those used to fall
 * through as HTTP 500, which hid the real cause behind "Failed to update config".
 */
async function verifyToken(request: NextRequest) {
    const token = bearerToken(request);
    try {
        return await adminAuth.verifyIdToken(token, true);
    } catch (error) {
        const code = String((error as { code?: string }).code ?? "");
        if (code === "auth/id-token-expired" || code === "auth/id-token-revoked") {
            throw new AuthorizationError(401, "Your session expired. Please sign in again.");
        }
        if (code === "auth/user-disabled") throw new AuthorizationError(401, "This account is deactivated. Please contact your school or support.");
        if (code.startsWith("auth/")) throw new AuthorizationError(401, "Authentication required");
        throw error;
    }
}

/** The role document, from the role claim when there is one, else by looking in each collection. */
async function resolveProfile(uid: string, claimedRole?: string): Promise<{ role: ProfileRole; profile: DocumentData }> {
    if (claimedRole && claimedRole in ROLE_COLLECTIONS) {
        const role = claimedRole as ProfileRole;
        const snapshot = await adminDb.collection(ROLE_COLLECTIONS[role]).doc(uid).get();
        if (snapshot.exists) return { role, profile: snapshot.data() ?? {} };
    }
    for (const role of Object.keys(ROLE_COLLECTIONS) as ProfileRole[]) {
        const snapshot = await adminDb.collection(ROLE_COLLECTIONS[role]).doc(uid).get();
        if (snapshot.exists) return { role, profile: snapshot.data() ?? {} };
    }
    throw new AuthorizationError(403, "User profile is missing");
}

/**
 * Who is calling: the verified token, the role document and, for school members, the school.
 * Members of a suspended school are refused everywhere. The call also marks the user active
 * today, which feeds the analytics.
 */
export async function requireUser(request: NextRequest, roles?: UserRole[]): Promise<AuthenticatedUser> {
    const decoded = await verifyToken(request);
    if (decoded.super_admin === true) {
        if (roles && !roles.includes("super_admin")) throw new AuthorizationError(403, "Role is not allowed");
        return { uid: decoded.uid, email: decoded.email ?? "", phone: null, role: "super_admin", superAdmin: true, schoolId: null, profile: null, school: null };
    }

    const { role, profile } = await resolveProfile(decoded.uid, typeof decoded.role === "string" ? decoded.role : undefined);
    if (roles && !roles.includes(role)) throw new AuthorizationError(403, "Role is not allowed");

    const schoolId = typeof profile.schoolId === "string" && profile.schoolId ? profile.schoolId : null;
    const school = schoolId ? await getSchool(schoolId) : null;
    if (schoolId && school?.status === "suspended") {
        throw new AuthorizationError(403, "Your school's account is suspended. Please contact your school.", SCHOOL_SUSPENDED_CODE);
    }

    const realEmail = typeof profile.email === "string" && profile.email && !isPhoneEmail(profile.email) ? profile.email : "";
    const phone = typeof profile.phone === "string" && profile.phone ? profile.phone : decoded.phone_number ?? null;
    const user: AuthenticatedUser = {
        uid: decoded.uid,
        email: realEmail || decoded.email || "",
        phone,
        role,
        superAdmin: false,
        schoolId,
        profile,
        school,
    };
    await recordActivity({
        uid: user.uid,
        collection: ROLE_COLLECTIONS[role],
        role,
        schoolId,
        classLevel: role === "student" ? Number(profile.class) || null : null,
        lastActiveDate: profile.lastActiveDate,
    });
    return user;
}

export async function requireSuperAdmin(request: NextRequest): Promise<AuthenticatedUser> {
    const decoded = await verifyToken(request);
    assertSuperAdminClaims(decoded);
    return { uid: decoded.uid, email: decoded.email ?? "", phone: null, role: "super_admin", superAdmin: true, schoolId: null, profile: null, school: null };
}

export interface SchoolScope {
    user: AuthenticatedUser;
    schoolId: string;
    school: School;
}

/**
 * A school admin acting on their own school. The super admin may act on any school by naming
 * it (`?schoolId=` or the `x-school-id` header), which is how support looks at a school.
 */
export async function requireSchoolAdmin(request: NextRequest): Promise<SchoolScope> {
    const user = await requireUser(request, ["school_admin", "super_admin"]);
    return requireSchoolAdminFrom(request, user);
}

export interface SchoolStaffScope extends SchoolScope {
    /** Null means every section of the school; a teacher with sections sees only those. */
    allowedSectionIds: string[] | null;
    isTeacher: boolean;
}

/**
 * A school admin, or a teacher who belongs to the school. Teachers are limited to their own
 * sections when the admin assigned them some.
 */
export async function requireSchoolStaff(request: NextRequest): Promise<SchoolStaffScope> {
    const user = await requireUser(request, ["school_admin", "teacher", "super_admin"]);
    if (user.role !== "teacher") {
        const scope = await requireSchoolAdminFrom(request, user);
        return { ...scope, allowedSectionIds: null, isTeacher: false };
    }
    if (!user.schoolId || !user.school) throw new AuthorizationError(403, "Your account is not linked to a school");
    const assigned = Array.isArray(user.profile?.assignedSectionIds) ? user.profile!.assignedSectionIds.map(String).filter(Boolean) : [];
    return { user, schoolId: user.schoolId, school: user.school, allowedSectionIds: assigned.length ? assigned : null, isTeacher: true };
}

async function requireSchoolAdminFrom(request: NextRequest, user: AuthenticatedUser): Promise<SchoolScope> {
    const requested = request.nextUrl.searchParams.get("schoolId") ?? request.headers.get("x-school-id");
    if (user.superAdmin) {
        if (!requested) throw new AuthorizationError(403, "Choose a school first");
        const school = await getSchool(requested);
        if (!school) throw new AuthorizationError(403, "School not found");
        return { user, schoolId: school.id, school };
    }
    if (!user.schoolId || !user.school) throw new AuthorizationError(403, "This account is not linked to a school");
    if (requested && requested !== user.schoolId) throw new AuthorizationError(403, "You can only manage your own school", CROSS_TENANT_CODE);
    return { user, schoolId: user.schoolId, school: user.school };
}

/** Refuses anything that belongs to another school; the super admin passes. */
export function assertSameSchool(user: AuthenticatedUser, targetSchoolId: string | null | undefined): void {
    if (user.superAdmin) return;
    if ((targetSchoolId ?? null) !== (user.schoolId ?? null)) {
        throw new AuthorizationError(403, "That record belongs to another school", CROSS_TENANT_CODE);
    }
}

export function authErrorResponse(error: unknown) {
    if (error instanceof AuthorizationError) {
        return { status: error.status, body: { success: false, error: error.message, ...(error.code ? { code: error.code } : {}) } };
    }
    return null;
}

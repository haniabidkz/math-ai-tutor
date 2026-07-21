import type { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { assertSuperAdminClaims, assertVerifiedClaims, AuthorizationError } from "@/lib/auth-claims";
import type { UserRole } from "@/types/user";

export interface AuthenticatedUser {
    uid: string;
    email: string;
    role: UserRole;
    superAdmin: boolean;
}

function bearerToken(request: NextRequest) {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) throw new AuthorizationError(401, "Authentication required");
    return header.slice(7);
}

async function resolveRole(uid: string, claimedRole?: UserRole): Promise<UserRole> {
    if (claimedRole) return claimedRole;
    for (const [collection, role] of [["students", "student"], ["parents", "parent"], ["teachers", "teacher"]] as const) {
        if ((await adminDb.collection(collection).doc(uid).get()).exists) return role;
    }
    throw new AuthorizationError(403, "User profile is missing");
}

export async function requireVerifiedUser(request: NextRequest, roles?: UserRole[]): Promise<AuthenticatedUser> {
    const decoded = await adminAuth.verifyIdToken(bearerToken(request), true);
    assertVerifiedClaims(decoded);
    const superAdmin = decoded.super_admin === true;
    const role = superAdmin ? "super_admin" : await resolveRole(decoded.uid, decoded.role as UserRole | undefined);
    if (roles && !roles.includes(role)) throw new AuthorizationError(403, "Role is not allowed");
    return { uid: decoded.uid, email: decoded.email ?? "", role, superAdmin };
}

export async function requireSuperAdmin(request: NextRequest): Promise<AuthenticatedUser> {
    const decoded = await adminAuth.verifyIdToken(bearerToken(request), true);
    assertSuperAdminClaims(decoded);
    return { uid: decoded.uid, email: decoded.email ?? "", role: "super_admin", superAdmin: true };
}

export function authErrorResponse(error: unknown) {
    if (error instanceof AuthorizationError) {
        return { status: error.status, body: { success: false, error: error.message } };
    }
    return null;
}

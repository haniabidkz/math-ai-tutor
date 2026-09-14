import type { NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { assertSuperAdminClaims, AuthorizationError } from "@/lib/auth-claims";
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
        if (code.startsWith("auth/")) throw new AuthorizationError(401, "Authentication required");
        throw error;
    }
}

async function resolveRole(uid: string, claimedRole?: UserRole): Promise<UserRole> {
    if (claimedRole) return claimedRole;
    for (const [collection, role] of [["students", "student"], ["parents", "parent"], ["teachers", "teacher"]] as const) {
        if ((await adminDb.collection(collection).doc(uid).get()).exists) return role;
    }
    throw new AuthorizationError(403, "User profile is missing");
}

export async function requireUser(request: NextRequest, roles?: UserRole[]): Promise<AuthenticatedUser> {
    const decoded = await verifyToken(request);
    const superAdmin = decoded.super_admin === true;
    const role = superAdmin ? "super_admin" : await resolveRole(decoded.uid, decoded.role as UserRole | undefined);
    if (roles && !roles.includes(role)) throw new AuthorizationError(403, "Role is not allowed");
    return { uid: decoded.uid, email: decoded.email ?? "", role, superAdmin };
}

export async function requireSuperAdmin(request: NextRequest): Promise<AuthenticatedUser> {
    const decoded = await verifyToken(request);
    assertSuperAdminClaims(decoded);
    return { uid: decoded.uid, email: decoded.email ?? "", role: "super_admin", superAdmin: true };
}

export function authErrorResponse(error: unknown) {
    if (error instanceof AuthorizationError) {
        return { status: error.status, body: { success: false, error: error.message } };
    }
    return null;
}

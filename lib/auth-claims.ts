import type { UserRole } from "@/types/user";

export interface AppClaims {
    uid: string;
    email?: string;
    email_verified?: boolean;
    role?: UserRole;
    super_admin?: boolean;
}

export class AuthorizationError extends Error {
    constructor(public status: 401 | 403, message: string, public code?: string) {
        super(message);
        this.name = "AuthorizationError";
    }
}

/** A request for another school's data: the body names the reason so screens can explain it. */
export const CROSS_TENANT_CODE = "FORBIDDEN_CROSS_TENANT";
export const SCHOOL_SUSPENDED_CODE = "SCHOOL_SUSPENDED";

export function assertVerifiedClaims(claims: AppClaims) {
    if (!claims.uid) throw new AuthorizationError(401, "Authentication required");
    if (!claims.email_verified) throw new AuthorizationError(403, "Email verification required");
}

export function assertSuperAdminClaims(claims: AppClaims) {
    assertVerifiedClaims(claims);
    if (!claims.super_admin) throw new AuthorizationError(403, "Super Admin access required");
}

import type { UserRole } from "@/types/user";

export interface AppClaims {
    uid: string;
    email?: string;
    email_verified?: boolean;
    role?: UserRole;
    super_admin?: boolean;
}

export class AuthorizationError extends Error {
    constructor(public status: 401 | 403, message: string) {
        super(message);
        this.name = "AuthorizationError";
    }
}

export function assertVerifiedClaims(claims: AppClaims) {
    if (!claims.uid) throw new AuthorizationError(401, "Authentication required");
    if (!claims.email_verified) throw new AuthorizationError(403, "Email verification required");
}

export function assertSuperAdminClaims(claims: AppClaims) {
    assertVerifiedClaims(claims);
    if (!claims.super_admin) throw new AuthorizationError(403, "Super Admin access required");
}

import { describe, expect, it } from "vitest";
import { assertSuperAdminClaims, assertVerifiedClaims, AuthorizationError } from "@/lib/auth-claims";

describe("authentication claims", () => {
    it("rejects unverified identities", () => {
        expect(() => assertVerifiedClaims({ uid: "student", email_verified: false })).toThrow(AuthorizationError);
    });

    it("accepts verified identities", () => {
        expect(() => assertVerifiedClaims({ uid: "student", email_verified: true })).not.toThrow();
    });

    it("requires both verification and the Super Admin claim", () => {
        expect(() => assertSuperAdminClaims({ uid: "admin", email_verified: true, super_admin: false })).toThrow();
        expect(() => assertSuperAdminClaims({ uid: "admin", email_verified: true, super_admin: true })).not.toThrow();
    });
});

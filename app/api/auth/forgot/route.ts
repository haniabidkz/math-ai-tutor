import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { isPhoneEmail, maskEmail, signInEmailFor } from "@/lib/phone";
import { authUserFor } from "@/lib/schools-server";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;
const attempts = new Map<string, number[]>();

function tooMany(address: string): boolean {
    const now = Date.now();
    const recent = (attempts.get(address) ?? []).filter((at) => now - at < WINDOW_MS);
    recent.push(now);
    attempts.set(address, recent);
    if (attempts.size > 5000) attempts.clear();
    return recent.length > MAX_PER_WINDOW;
}

async function sendResetEmail(email: string, continueUrl: string | null): Promise<void> {
    const send = (body: Record<string, string>) => fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "PASSWORD_RESET", email, ...body }),
    });
    let response = await send(continueUrl ? { continueUrl } : {});
    // A continue link needs an authorised domain; without it the reset still works, it just ends on Firebase's page.
    if (!response.ok && continueUrl) response = await send({});
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(`Password reset email failed: ${String(data.error?.message ?? response.status)}`);
    }
}

/**
 * "Forgot password": Firebase emails a reset link to the account's email. Accounts without an
 * email (phone only) are told so, because the only other way is an admin reset. For an email we
 * answer the same whether or not an account exists, so nobody can list addresses.
 */
export async function POST(request: NextRequest) {
    try {
        const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        if (tooMany(address)) return NextResponse.json({ success: false, error: "Too many requests from this connection. Please wait a few minutes." }, { status: 429 });
        const body = await request.json().catch(() => ({}));
        const identifier = String(body.identifier ?? "").trim();
        const target = signInEmailFor(identifier);
        if ("error" in target) return NextResponse.json({ success: false, error: target.error }, { status: 400 });

        const user = await authUserFor(identifier);
        const email = user?.email && !isPhoneEmail(user.email) ? user.email : null;
        if (!email) return ok(target.phone ? { sent: false, reason: "no-email" } : { sent: true });
        if (user?.disabled) return ok({ sent: false, reason: "disabled" });

        const role = typeof body.role === "string" && /^[a-z]+$/.test(body.role) ? body.role : "student";
        await sendResetEmail(email, `${request.nextUrl.origin}/login?role=${role}`);
        return ok({ sent: true, maskedEmail: maskEmail(email) });
    } catch (error) {
        return failure(error, "The reset email could not be sent. Please try again.");
    }
}

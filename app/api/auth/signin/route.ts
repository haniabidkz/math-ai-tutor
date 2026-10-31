import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { adminAuth } from "@/lib/firebase-admin";
import { authUserFor } from "@/lib/schools-server";

export const dynamic = "force-dynamic";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 60;
const attempts = new Map<string, number[]>();

function tooMany(address: string): boolean {
    const now = Date.now();
    const recent = (attempts.get(address) ?? []).filter((at) => now - at < WINDOW_MS);
    recent.push(now);
    attempts.set(address, recent);
    if (attempts.size > 5000) attempts.clear();
    return recent.length > MAX_PER_WINDOW;
}

const WRONG = "The phone/email or the password is wrong. Please check and try again.";

/**
 * Sign-in by phone number. The account's email is looked up on the server and the password is
 * checked by Firebase, so the browser never learns which email belongs to a phone. The answer is
 * a one-time token the browser signs in with.
 */
export async function POST(request: NextRequest) {
    try {
        const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        if (tooMany(address)) return NextResponse.json({ success: false, error: "Too many attempts from this connection. Please wait a few minutes." }, { status: 429 });
        const body = await request.json().catch(() => ({}));
        const identifier = String(body.identifier ?? "").trim();
        const password = String(body.password ?? "");
        if (!identifier || !password) return NextResponse.json({ success: false, error: "Enter your phone number and password" }, { status: 400 });

        const user = await authUserFor(identifier);
        if (!user?.email) return NextResponse.json({ success: false, error: WRONG }, { status: 401 });
        if (user.disabled) return NextResponse.json({ success: false, error: "This account is deactivated. Please contact your school or support." }, { status: 403 });

        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: user.email, password, returnSecureToken: false }),
        });
        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const code = String(data.error?.message ?? "");
            if (code.startsWith("TOO_MANY_ATTEMPTS")) return NextResponse.json({ success: false, error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 });
            if (code === "USER_DISABLED") return NextResponse.json({ success: false, error: "This account is deactivated. Please contact your school or support." }, { status: 403 });
            return NextResponse.json({ success: false, error: WRONG }, { status: 401 });
        }
        return ok({ customToken: await adminAuth.createCustomToken(user.uid) });
    } catch (error) {
        return failure(error, "Sign-in failed. Please try again.");
    }
}

import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { phoneToEmail } from "@/lib/phone";
import { signupSchema } from "@/lib/schools";
import { signUp } from "@/lib/schools-server";

export const dynamic = "force-dynamic";

/** Sign-ups per address inside the window; a classroom signing up together stays well under it. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const attempts = new Map<string, number[]>();

function tooMany(address: string): boolean {
    const now = Date.now();
    const recent = (attempts.get(address) ?? []).filter((at) => now - at < WINDOW_MS);
    recent.push(now);
    attempts.set(address, recent);
    if (attempts.size > 5000) attempts.clear();
    return recent.length > MAX_PER_WINDOW;
}

/**
 * Creates a student, parent or teacher account with a phone number and password. The
 * profile is written here, on the server, so a school code, the seat limit and the field
 * rules are enforced before anything exists. The browser then signs in with the returned
 * sign-in email.
 */
export async function POST(request: NextRequest) {
    try {
        const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        if (tooMany(address)) return NextResponse.json({ success: false, error: "Too many sign-ups from this connection. Please try again in a few minutes." }, { status: 429 });
        const input = signupSchema.parse(await request.json());
        const result = await signUp(input);
        return ok({ uid: result.uid, role: result.role, signInEmail: phoneToEmail(input.phone), schoolId: result.schoolId, schoolName: result.schoolName }, 201);
    } catch (error) {
        return failure(error, "The account could not be created. Please try again.");
    }
}

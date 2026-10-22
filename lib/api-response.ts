import { NextResponse } from "next/server";
import { authErrorResponse } from "@/lib/server-auth";
import { firstIssue } from "@/lib/schools";
import { schoolErrorResponse } from "@/lib/schools-server";

/** One place that turns the known error types into the right HTTP answer. */
export function failure(error: unknown, fallback: string): NextResponse {
    const auth = authErrorResponse(error);
    if (auth) return NextResponse.json(auth.body, { status: auth.status });
    const school = schoolErrorResponse(error);
    if (school) return NextResponse.json(school.body, { status: school.status });
    if (error && typeof error === "object" && Array.isArray((error as { issues?: unknown }).issues)) {
        return NextResponse.json({ success: false, error: firstIssue(error) }, { status: 400 });
    }
    console.error(fallback, error);
    return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

export const ok = (body: Record<string, unknown>, status = 200) => NextResponse.json({ success: true, ...body }, { status });

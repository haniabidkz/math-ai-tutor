import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { parseStudentImport } from "@/lib/schools";
import { importStudents } from "@/lib/schools-server";
import { requireSchoolStaff } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * Bulk import from pasted rows (name, phone, class, section, password, parent phone, email).
 * With `preview: true` the rows are only checked; otherwise every valid row becomes an account
 * and the answer lists each line's outcome and generated password.
 */
export async function POST(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const body = await request.json();
        const text = typeof body.text === "string" ? body.text : "";
        if (!text.trim()) return NextResponse.json({ success: false, error: "Paste at least one student row" }, { status: 400 });
        const parsed = parseStudentImport(text);
        if (body.preview === true) return ok({ rows: parsed.rows, valid: parsed.valid, invalid: parsed.invalid, truncated: parsed.truncated });
        const outcomes = await importStudents(scope.schoolId, parsed.rows, scope.user, scope.allowedSectionIds ? new Set(scope.allowedSectionIds) : null);
        return ok({
            outcomes,
            created: outcomes.filter((item) => item.status === "created").length,
            failed: outcomes.filter((item) => item.status === "failed").length,
            truncated: parsed.truncated,
        });
    } catch (error) {
        return failure(error, "The import failed");
    }
}

import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { promotionInputSchema } from "@/lib/schools";
import { previewPromotion, promoteSchool } from "@/lib/schools-server";
import { requireSchoolAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** What the annual promotion would do, before anyone presses the button. */
export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        const plan = await previewPromotion(scope.schoolId);
        return ok({ plan, lastPromotedAt: scope.school.lastPromotedAt });
    } catch (error) {
        return failure(error, "The promotion preview failed");
    }
}

/** Runs it. The admin types the school code to confirm. */
export async function POST(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        const input = promotionInputSchema.parse(await request.json());
        if (input.confirmCode !== scope.school.code) return NextResponse.json({ success: false, error: `Type the school code ${scope.school.code} to confirm` }, { status: 400 });
        const result = await promoteSchool(scope.schoolId, { askDiagnosticAgain: input.askDiagnosticAgain, force: input.force }, scope.user);
        return ok({ result });
    } catch (error) {
        return failure(error, "The promotion failed");
    }
}

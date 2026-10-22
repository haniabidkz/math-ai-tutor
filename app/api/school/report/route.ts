import { NextRequest } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { schoolReport } from "@/lib/schools-server";
import { requireSchoolStaff } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Performance by section plus every student row, for the report screen and its exports. */
export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const report = await schoolReport(scope.schoolId);
        if (scope.allowedSectionIds) {
            const allowed = new Set(scope.allowedSectionIds);
            report.sections = report.sections.filter((section) => section.sectionId && allowed.has(section.sectionId));
            report.students = report.students.filter((student) => student.sectionId && allowed.has(student.sectionId));
        }
        return ok({ ...report, school: { name: scope.school.name, code: scope.school.code, plan: scope.school.effectivePlan }, generatedAt: Date.now() });
    } catch (error) {
        return failure(error, "The report could not be built");
    }
}

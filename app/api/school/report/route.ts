import { NextRequest } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { teacherCanSeeStudent } from "@/lib/schools";
import { schoolReport } from "@/lib/schools-server";
import { requireSchoolStaff } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Performance by section plus every student row, for the report screen and its exports. */
export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const report = await schoolReport(scope.schoolId);
        if (scope.rule) {
            const rule = scope.rule;
            report.sections = report.sections.filter((section) => rule.classes.includes(section.classLevel) || (section.sectionId !== null && rule.sectionIds.includes(section.sectionId)));
            report.students = report.students.filter((student) => teacherCanSeeStudent(rule, student));
        }
        return ok({ ...report, school: { name: scope.school.name, code: scope.school.code, plan: scope.school.effectivePlan }, generatedAt: Date.now() });
    } catch (error) {
        return failure(error, "The report could not be built");
    }
}

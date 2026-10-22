import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { managedStudentSchema, memberActionSchema, studentUpdateSchema } from "@/lib/schools";
import { enrollStudent, listSchoolStudents, memberAction, memberInSchool, SchoolError, updateStudentInSchool } from "@/lib/schools-server";
import { requireSchoolStaff, type SchoolStaffScope } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** A teacher may touch students in their own sections only; an admin may touch any. */
async function assertAllowed(scope: SchoolStaffScope, uid: string) {
    if (!scope.allowedSectionIds) return;
    const { data } = await memberInSchool("students", scope.schoolId, uid);
    if (!data.sectionId || !scope.allowedSectionIds.includes(String(data.sectionId))) throw new SchoolError(403, "This student is not in one of your sections");
}

export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const students = await listSchoolStudents(scope.schoolId, { sectionIds: scope.allowedSectionIds });
        return ok({ students, allowedSectionIds: scope.allowedSectionIds });
    } catch (error) {
        return failure(error, "Students could not be loaded");
    }
}

/** Adds one student directly into a class or section. */
export async function POST(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const input = managedStudentSchema.parse(await request.json());
        if (scope.allowedSectionIds && (!input.sectionId || !scope.allowedSectionIds.includes(input.sectionId))) {
            return NextResponse.json({ success: false, error: "Choose one of your own sections" }, { status: 403 });
        }
        const result = await enrollStudent({ ...input, schoolId: scope.schoolId, source: scope.isTeacher ? "teacher" : "admin" }, scope.user);
        return ok({ uid: result.uid, password: result.password, sectionLabel: result.sectionLabel }, 201);
    } catch (error) {
        return failure(error, "The student could not be added");
    }
}

/** Edits a student (name, class, section, parent contact) or runs an account action. */
export async function PATCH(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const body = await request.json();
        const uid = String(body.uid ?? "");
        if (!uid) return NextResponse.json({ success: false, error: "uid is required" }, { status: 400 });
        await assertAllowed(scope, uid);

        if (typeof body.action === "string") {
            const parsed = memberActionSchema.parse({ action: body.action, password: body.password });
            if (scope.isTeacher && parsed.action !== "resetPassword") {
                return NextResponse.json({ success: false, error: "Only the school admin can suspend or remove a student" }, { status: 403 });
            }
            const result = await memberAction({ collection: "students", schoolId: scope.schoolId, uid, action: parsed.action, password: parsed.password, actor: scope.user });
            return ok({ password: result.password });
        }

        const update = studentUpdateSchema.parse(body);
        if (scope.allowedSectionIds && update.sectionId !== undefined && (!update.sectionId || !scope.allowedSectionIds.includes(update.sectionId))) {
            return NextResponse.json({ success: false, error: "Choose one of your own sections" }, { status: 403 });
        }
        await updateStudentInSchool(scope.schoolId, uid, update, scope.user);
        return ok({});
    } catch (error) {
        return failure(error, "The student could not be updated");
    }
}

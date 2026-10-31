import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { managedStudentSchema, memberActionSchema, studentUpdateSchema, teacherCanSeeStudent, teacherCanUseSection, teacherHasWholeClass } from "@/lib/schools";
import { authFlags, enrollStudent, listSchoolStudents, listSections, memberAction, memberInSchool, SchoolError, updateStudentInSchool } from "@/lib/schools-server";
import { requireSchoolStaff, type SchoolStaffScope } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** A teacher may touch students in their own classes and sections only; an admin may touch any. */
async function assertAllowed(scope: SchoolStaffScope, uid: string) {
    if (!scope.rule) return;
    const { data } = await memberInSchool("students", scope.schoolId, uid);
    const student = { classLevel: Number(data.class), sectionId: typeof data.sectionId === "string" ? data.sectionId : null };
    if (!teacherCanSeeStudent(scope.rule, student)) throw new SchoolError(403, "This student is not in one of your classes or sections");
}

/** A teacher adds students to a whole class they look after, or to one of their sections. */
async function placementAllowed(scope: SchoolStaffScope, classLevel: number, sectionId: string | null): Promise<boolean> {
    if (!scope.rule) return true;
    if (!sectionId) return teacherHasWholeClass(scope.rule, classLevel);
    const sections = await listSections(scope.schoolId, false);
    const section = sections.find((item) => item.id === sectionId);
    return Boolean(section) && teacherCanUseSection(scope.rule, section!);
}

export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        // Suspended students are kept out of the school's view; the admin can list them to reactivate.
        const suspended = request.nextUrl.searchParams.get("suspended") === "only" && !scope.isTeacher ? "only" : "exclude";
        const students = await listSchoolStudents(scope.schoolId, { rule: scope.rule, suspended });
        return ok({ students, rule: scope.rule });
    } catch (error) {
        return failure(error, "Students could not be loaded");
    }
}

/** Adds one student directly into a class or section. */
export async function POST(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const input = managedStudentSchema.parse(await request.json());
        if (!(await placementAllowed(scope, input.classLevel, input.sectionId))) {
            return NextResponse.json({ success: false, error: "Choose one of your own classes or sections" }, { status: 403 });
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
        if ((await authFlags([uid])).get(uid)?.disabled) {
            return NextResponse.json({ success: false, error: "This student is suspended. Reactivate the account before changing it." }, { status: 409 });
        }
        if (scope.rule && (update.classLevel !== undefined || update.sectionId !== undefined)) {
            const { data } = await memberInSchool("students", scope.schoolId, uid);
            const classLevel = update.classLevel ?? Number(data.class);
            const sectionId = update.sectionId !== undefined ? update.sectionId : (typeof data.sectionId === "string" ? data.sectionId : null);
            if (!(await placementAllowed(scope, classLevel, sectionId))) {
                return NextResponse.json({ success: false, error: "Choose one of your own classes or sections" }, { status: 403 });
            }
        }
        await updateStudentInSchool(scope.schoolId, uid, update, scope.user);
        return ok({});
    } catch (error) {
        return failure(error, "The student could not be updated");
    }
}

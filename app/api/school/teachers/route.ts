import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { managedTeacherSchema, memberActionSchema, teacherUpdateSchema } from "@/lib/schools";
import { addTeacher, listSchoolTeachers, memberAction, updateTeacherInSchool } from "@/lib/schools-server";
import { requireSchoolAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        return ok({ teachers: await listSchoolTeachers(scope.schoolId) });
    } catch (error) {
        return failure(error, "Teachers could not be loaded");
    }
}

/** A teacher account for this school, with the sections they look after. */
export async function POST(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        const input = managedTeacherSchema.parse(await request.json());
        const result = await addTeacher(scope.schoolId, input, scope.user);
        return ok({ uid: result.uid, password: result.password }, 201);
    } catch (error) {
        return failure(error, "The teacher could not be added");
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        const body = await request.json();
        const uid = String(body.uid ?? "");
        if (!uid) return NextResponse.json({ success: false, error: "uid is required" }, { status: 400 });
        if (typeof body.action === "string") {
            const parsed = memberActionSchema.parse({ action: body.action, password: body.password });
            const result = await memberAction({ collection: "teachers", schoolId: scope.schoolId, uid, action: parsed.action, password: parsed.password, actor: scope.user });
            return ok({ password: result.password });
        }
        await updateTeacherInSchool(scope.schoolId, uid, teacherUpdateSchema.parse(body), scope.user);
        return ok({});
    } catch (error) {
        return failure(error, "The teacher could not be updated");
    }
}

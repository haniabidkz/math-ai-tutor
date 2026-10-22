import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { memberActionSchema, schoolAdminInputSchema, schoolUpdateSchema } from "@/lib/schools";
import { addSchoolAdmin, listSchoolAdmins, memberAction, recountSeats, schoolOverview, updateSchool } from "@/lib/schools-server";
import { requireSuperAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One school in full: plan, seats, sections, counts and its admin accounts. */
export async function GET(request: NextRequest, context: Params) {
    try {
        await requireSuperAdmin(request);
        const { id } = await context.params;
        const [overview, admins] = await Promise.all([schoolOverview(id), listSchoolAdmins(id)]);
        return ok({ ...overview, admins });
    } catch (error) {
        return failure(error, "The school could not be loaded");
    }
}

/** Plan, dates, seats, contact details, demo access and suspension. */
export async function PATCH(request: NextRequest, context: Params) {
    try {
        const admin = await requireSuperAdmin(request);
        const { id } = await context.params;
        const update = schoolUpdateSchema.parse(await request.json());
        return ok({ school: await updateSchool(id, update, admin) });
    } catch (error) {
        return failure(error, "The school could not be updated");
    }
}

/** Actions on a school: add an admin, act on an admin account, recount seats. */
export async function POST(request: NextRequest, context: Params) {
    try {
        const admin = await requireSuperAdmin(request);
        const { id } = await context.params;
        const body = await request.json();
        if (body.action === "addAdmin") {
            const input = schoolAdminInputSchema.parse(body.admin ?? {});
            const created = await addSchoolAdmin(id, input, admin);
            return ok({ uid: created.uid, admins: await listSchoolAdmins(id) }, 201);
        }
        if (body.action === "adminAction") {
            const parsed = memberActionSchema.parse({ action: body.memberAction, password: body.password });
            const result = await memberAction({ collection: "schoolAdmins", schoolId: id, uid: String(body.uid ?? ""), action: parsed.action, password: parsed.password, actor: admin });
            return ok({ password: result.password, admins: await listSchoolAdmins(id) });
        }
        if (body.action === "recountSeats") return ok({ seatsUsed: await recountSeats(id) });
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    } catch (error) {
        return failure(error, "The action failed");
    }
}

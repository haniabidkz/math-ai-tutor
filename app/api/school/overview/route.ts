import { NextRequest } from "next/server";
import { z } from "zod";
import { failure, ok } from "@/lib/api-response";
import { normalizePhone } from "@/lib/phone";
import { listSchoolAdmins, schoolOverview, updateSchool } from "@/lib/schools-server";
import { requireSchoolAdmin, requireSchoolStaff } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** The school admin's home: plan, seats, sections and headline counts. */
export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const [overview, admins] = await Promise.all([schoolOverview(scope.schoolId), scope.isTeacher ? [] : listSchoolAdmins(scope.schoolId)]);
        return ok({
            ...overview,
            admins,
            viewer: { role: scope.user.role, name: String(scope.user.profile?.name ?? scope.user.email), allowedSectionIds: scope.allowedSectionIds },
        });
    } catch (error) {
        return failure(error, "The school overview could not be loaded");
    }
}

const detailsSchema = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    city: z.string().trim().max(60).optional(),
    contactName: z.string().trim().max(80).optional(),
    contactPhone: z.string().trim().max(30).optional(),
    contactEmail: z.string().trim().max(120).optional(),
});

/** The school admin may change the school's own details; plan, seats and code stay with the super admin. */
export async function PATCH(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        const input = detailsSchema.parse(await request.json());
        const contactPhone = input.contactPhone === undefined ? undefined : input.contactPhone ? normalizePhone(input.contactPhone) : null;
        if (input.contactPhone && !contactPhone) return failure({ issues: [{ message: "Enter a valid mobile number, like 03001234567" }] }, "Invalid phone");
        const school = await updateSchool(scope.schoolId, {
            name: input.name, city: input.city, contactName: input.contactName,
            ...(contactPhone !== undefined ? { contactPhone } : {}),
            ...(input.contactEmail !== undefined ? { contactEmail: input.contactEmail.toLowerCase() || null } : {}),
        }, scope.user);
        return ok({ school });
    } catch (error) {
        return failure(error, "The school details could not be saved");
    }
}

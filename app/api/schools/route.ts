import { NextRequest } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { schoolInputSchema } from "@/lib/schools";
import { createSchool, getAccessSettings, listSchools } from "@/lib/schools-server";
import { requireSuperAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Every school with its plan and seats, for the Super Admin's Schools tab. */
export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const [schools, settings] = await Promise.all([listSchools(), getAccessSettings()]);
        return ok({ schools, settings });
    } catch (error) {
        return failure(error, "Schools could not be loaded");
    }
}

/** A new school with its code, trial and first admin account. */
export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const input = schoolInputSchema.parse(await request.json());
        const result = await createSchool(input, admin);
        return ok({ school: result.school, admin: result.admin }, 201);
    } catch (error) {
        return failure(error, "The school could not be created");
    }
}

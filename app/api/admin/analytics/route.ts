import { NextRequest } from "next/server";
import { platformAnalytics } from "@/lib/analytics-server";
import { failure, ok } from "@/lib/api-response";
import { getAccessSettings, listSchools } from "@/lib/schools-server";
import { requireSuperAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Platform usage, conversion and error intelligence for the Super Admin. */
export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const [schools, settings] = await Promise.all([listSchools(), getAccessSettings()]);
        const analytics = await platformAnalytics({ schools, settings });
        return ok({ analytics, schools: schools.map((school) => ({ id: school.id, name: school.name, code: school.code, plan: school.effectivePlan, seatsUsed: school.seatsUsed, seatLimit: school.seatLimit, status: school.status })) });
    } catch (error) {
        return failure(error, "Analytics could not be loaded");
    }
}

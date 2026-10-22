import { NextRequest } from "next/server";
import { ACCESS_SETTING_LIMITS } from "@/lib/access";
import { failure, ok } from "@/lib/api-response";
import { getAccessSettings, saveAccessSettings } from "@/lib/schools-server";
import { requireSuperAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** Platform access settings: free chapters, trial length, default seats. */
export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        return ok({ settings: await getAccessSettings(true), limits: ACCESS_SETTING_LIMITS });
    } catch (error) {
        return failure(error, "Settings could not be loaded");
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const settings = await saveAccessSettings(await request.json(), admin);
        return ok({ settings });
    } catch (error) {
        return failure(error, "Settings could not be saved");
    }
}

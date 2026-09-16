import { NextRequest, NextResponse } from "next/server";
import { checkAiStatus, checkModels } from "@/lib/ai-studio/ai";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

/** Two services, each with a model list and possibly a backup model to try. */
export const maxDuration = 120;

/**
 * GET checks the keys and models; POST also sends one tiny request to each service.
 * POST ?models=1 instead tries every preferred model at once and reports each one.
 */
async function handle(request: NextRequest, probe: boolean) {
    try {
        await requireSuperAdmin(request);
        if (probe && request.nextUrl.searchParams.get("models") === "1") {
            return NextResponse.json({ success: true, models: await checkModels() });
        }
        return NextResponse.json({ success: true, status: await checkAiStatus(probe) });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Could not check the AI connection" }, { status: 500 });
    }
}

export const GET = (request: NextRequest) => handle(request, false);
export const POST = (request: NextRequest) => handle(request, true);

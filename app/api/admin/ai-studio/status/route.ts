import { NextRequest, NextResponse } from "next/server";
import { checkAiStatus } from "@/lib/ai-studio/ai";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export const maxDuration = 60;

/** GET checks the key and models; POST also sends one tiny request to prove billing works. */
async function handle(request: NextRequest, probe: boolean) {
    try {
        await requireSuperAdmin(request);
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

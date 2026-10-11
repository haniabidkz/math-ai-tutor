import { NextRequest, NextResponse } from "next/server";
import { listNotifications, markNotificationsRead } from "@/lib/notifications-server";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** The student's latest notifications and how many are unread. */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const { items, unread } = await listNotifications(user.uid);
        return NextResponse.json({ success: true, items, unread });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load notifications" }, { status: 500 });
    }
}

/** Marks notifications read: the listed ids, or all of them. */
export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const body = await request.json().catch(() => ({}));
        const ids = Array.isArray(body.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string") : undefined;
        const updated = await markNotificationsRead(user.uid, ids);
        return NextResponse.json({ success: true, updated });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to update notifications" }, { status: 500 });
    }
}

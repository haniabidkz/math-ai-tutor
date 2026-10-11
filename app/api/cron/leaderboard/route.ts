import { NextRequest, NextResponse } from "next/server";
import { leaderboardWeekKey, previousWeekKey } from "@/lib/leaderboard";
import { ensureWeekFinalized } from "@/lib/leaderboard-server";

export const dynamic = "force-dynamic";

/**
 * Runs just after midnight on Monday (Pakistan time) through the Vercel cron in vercel.json
 * and closes last week's boards. The boards also close themselves on the first visit of the
 * new week, so a missed run changes nothing; the cron only makes the results arrive sooner.
 */
export async function GET(request: NextRequest) {
    const secret = process.env.CRON_SECRET;
    if (!secret) return NextResponse.json({ success: false, error: "CRON_SECRET is not configured" }, { status: 503 });
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    try {
        const now = new Date();
        await ensureWeekFinalized(now);
        return NextResponse.json({ success: true, closedWeek: previousWeekKey(leaderboardWeekKey(now)) });
    } catch (error) {
        console.error("Leaderboard cron failed", error);
        return NextResponse.json({ success: false, error: "Failed to close the week" }, { status: 500 });
    }
}

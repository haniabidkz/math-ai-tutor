import { NextRequest, NextResponse } from "next/server";
import { isLeaderboardClass, isValidWeekKey, leaderboardWeekKey, previousWeekKey, weekLabel } from "@/lib/leaderboard";
import {
    approveWinners, boardSummary, ensureWeekFinalized, finalizeWeek, LeaderboardError, pointHistory, rewardHistory, rewardSummary,
    setMembership, setRewardDelivered, setStudentFlags, studentsMeta,
} from "@/lib/leaderboard-server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const WEEKS_LISTED = 10;

function errorResponse(error: unknown, fallback: string) {
    const auth = authErrorResponse(error);
    if (auth) return NextResponse.json(auth.body, { status: auth.status });
    if (error instanceof LeaderboardError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error(fallback, error);
    return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

/**
 * One class board for one week, with each student's membership and flags, the reward
 * decision for that week, and the history of winners. With ?uid= it returns a student's
 * point history instead.
 */
export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const params = request.nextUrl.searchParams;
        const uid = params.get("uid");
        if (uid) return NextResponse.json({ success: true, history: await pointHistory(uid) });

        const now = new Date();
        const current = leaderboardWeekKey(now);
        const weekKey = params.get("week") ?? current;
        const classLevel = Number(params.get("class") ?? 6);
        if (!isValidWeekKey(weekKey)) return NextResponse.json({ success: false, error: "week must be a Monday date like 2026-10-05" }, { status: 400 });
        if (!isLeaderboardClass(classLevel)) return NextResponse.json({ success: false, error: "class must be 6, 7 or 8" }, { status: 400 });

        try {
            await ensureWeekFinalized(now);
        } catch (error) {
            console.error("Could not close last week's leaderboard", error);
        }

        const [summary, reward, history] = await Promise.all([boardSummary(weekKey, classLevel), rewardSummary(weekKey, classLevel), rewardHistory()]);
        const meta = await studentsMeta(summary.top.map((entry) => entry.uid));
        const weeks: string[] = [];
        for (let key = current, index = 0; index < WEEKS_LISTED; key = previousWeekKey(key), index++) weeks.push(key);

        return NextResponse.json({
            success: true,
            weekKey,
            label: weekLabel(weekKey),
            classLevel,
            current,
            weeks: weeks.map((key) => ({ weekKey: key, label: weekLabel(key) })),
            finalized: summary.finalized,
            finalizedAt: summary.finalizedAt,
            participants: summary.participants,
            entries: summary.top.map((entry) => {
                const info = meta.get(entry.uid);
                return {
                    rank: entry.rank, uid: entry.uid, name: info?.name ?? entry.name, email: info?.email ?? "",
                    points: entry.points, correctAnswers: entry.correctAnswers, lastScoredAt: entry.lastScoredAt,
                    paid: info?.paid ?? false, banned: info?.banned ?? false, suspicious: info?.suspicious ?? false, note: info?.note ?? "",
                };
            }),
            reward,
            history: history.map((item) => ({ ...item, label: weekLabel(item.weekKey) })),
        });
    } catch (error) {
        return errorResponse(error, "Failed to load the leaderboard");
    }
}

/** Admin actions: close a week, approve winners, mark delivery, flag accounts, set membership. */
export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const body = await request.json();
        const action = String(body.action ?? "");
        const weekKey = String(body.weekKey ?? "");
        const classLevel = Number(body.classLevel);

        if (action === "finalize") {
            if (!isValidWeekKey(weekKey)) return NextResponse.json({ success: false, error: "weekKey must be a Monday date" }, { status: 400 });
            if (weekKey >= leaderboardWeekKey()) return NextResponse.json({ success: false, error: "A week can be closed only after it ends" }, { status: 409 });
            return NextResponse.json({ success: true, outcomes: await finalizeWeek(weekKey) });
        }
        if (action === "approve") {
            if (!isValidWeekKey(weekKey)) return NextResponse.json({ success: false, error: "weekKey must be a Monday date" }, { status: 400 });
            const picks = Array.isArray(body.winners)
                ? body.winners.map((pick: { uid?: unknown; place?: unknown }) => ({ uid: String(pick.uid ?? ""), place: Number(pick.place) }))
                : [];
            return NextResponse.json({ success: true, reward: await approveWinners(weekKey, classLevel, picks, admin) });
        }
        if (action === "delivered") {
            if (!isValidWeekKey(weekKey) || !isLeaderboardClass(classLevel)) return NextResponse.json({ success: false, error: "weekKey and classLevel are required" }, { status: 400 });
            return NextResponse.json({ success: true, reward: await setRewardDelivered(weekKey, classLevel, String(body.uid ?? ""), body.delivered !== false, admin) });
        }
        if (action === "flags") {
            const uid = String(body.uid ?? "");
            if (!uid) return NextResponse.json({ success: false, error: "uid is required" }, { status: 400 });
            const student = await setStudentFlags(uid, { banned: body.banned, suspicious: body.suspicious, note: body.note }, admin);
            return NextResponse.json({ success: true, student });
        }
        if (action === "membership") {
            const uid = String(body.uid ?? "");
            if (!uid) return NextResponse.json({ success: false, error: "uid is required" }, { status: 400 });
            return NextResponse.json({ success: true, student: await setMembership(uid, body.paid === true, admin) });
        }
        return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
    } catch (error) {
        return errorResponse(error, "The leaderboard action failed");
    }
}

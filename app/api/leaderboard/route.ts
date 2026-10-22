import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isLeaderboardClass, leaderboardWeekKey, POINT_RULES, previousWeekKey, REWARD_PLACES, weekEndMillis, weekLabel } from "@/lib/leaderboard";
import { boardSummary, countParticipants, ensureWeekFinalized, publicEntry, readBoard, rewardSummary, standingFor } from "@/lib/leaderboard-server";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** The student's own class board for this week, their rank, and last week's closed results. */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const profile = (await adminDb.collection("students").doc(user.uid).get()).data() ?? {};
        const classLevel = Number(profile.class);
        if (!isLeaderboardClass(classLevel)) {
            return NextResponse.json({ success: false, error: "The leaderboard is for Class 6, 7 and 8" }, { status: 409 });
        }

        const now = new Date();
        try {
            await ensureWeekFinalized(now);
        } catch (error) {
            // Last week closes on the next request; this week's board still shows.
            console.error("Could not close last week's leaderboard", error);
        }
        const weekKey = leaderboardWeekKey(now);
        const lastWeek = previousWeekKey(weekKey);
        // A school's students compete among themselves; individual students share the public board.
        const scope = user.schoolId;
        const [entries, participants, me, previous, previousReward, previousMe] = await Promise.all([
            readBoard(weekKey, classLevel, scope),
            countParticipants(weekKey, classLevel, scope),
            standingFor(weekKey, classLevel, user.uid, scope),
            boardSummary(lastWeek, classLevel, scope),
            rewardSummary(lastWeek, classLevel, scope),
            standingFor(lastWeek, classLevel, user.uid, scope),
        ]);

        return NextResponse.json({
            success: true,
            classLevel,
            school: user.school ? { name: user.school.name } : null,
            weekKey,
            label: weekLabel(weekKey),
            resetsAt: weekEndMillis(weekKey),
            participants,
            entries: entries.map((entry) => ({ ...publicEntry(entry), me: entry.uid === user.uid })),
            me: me ? publicEntry(me) : null,
            previous: previous.participants > 0 || previous.finalized ? {
                weekKey: lastWeek,
                label: weekLabel(lastWeek),
                participants: previous.participants,
                top: previous.top.slice(0, REWARD_PLACES).map(publicEntry),
                me: previousMe ? publicEntry(previousMe) : null,
                winners: previousReward?.status === "approved"
                    ? previousReward.winners.map((winner) => ({ uid: winner.uid, name: winner.name, place: winner.place, me: winner.uid === user.uid }))
                    : [],
            } : null,
            rules: POINT_RULES,
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load the leaderboard" }, { status: 500 });
    }
}

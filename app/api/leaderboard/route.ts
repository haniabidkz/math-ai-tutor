import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { isLeaderboardClass, leaderboardWeekKey, POINT_RULES, previousWeekKey, REWARD_PLACES, weekEndMillis, weekLabel } from "@/lib/leaderboard";
import { boardSummary, countParticipants, ensureWeekFinalized, mostImprovedFor, publicEntry, readBoard, rewardSummary, standingFor } from "@/lib/leaderboard-server";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * A class board for this week (the student's own class unless `?class=` names another of
 * Class 6, 7 and 8), the student's rank on their own board, the most improved student, and
 * last week's closed results. A student earns points only on their own class's board.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const profile = (await adminDb.collection("students").doc(user.uid).get()).data() ?? {};
        const ownClass = Number(profile.class);
        if (!isLeaderboardClass(ownClass)) {
            return NextResponse.json({ success: false, error: "The leaderboard is for Class 6, 7 and 8" }, { status: 409 });
        }
        const requested = Number(request.nextUrl.searchParams.get("class"));
        const classLevel = isLeaderboardClass(requested) ? requested : ownClass;
        const ownBoard = classLevel === ownClass;

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
        const [entries, participants, me, previous, previousReward, previousMe, improved, previousImproved] = await Promise.all([
            readBoard(weekKey, classLevel, scope),
            countParticipants(weekKey, classLevel, scope),
            ownBoard ? standingFor(weekKey, classLevel, user.uid, scope) : Promise.resolve(null),
            boardSummary(lastWeek, classLevel, scope),
            rewardSummary(lastWeek, classLevel, scope),
            ownBoard ? standingFor(lastWeek, classLevel, user.uid, scope) : Promise.resolve(null),
            mostImprovedFor(weekKey, classLevel, scope),
            mostImprovedFor(lastWeek, classLevel, scope),
        ]);

        return NextResponse.json({
            success: true,
            classLevel,
            ownClass,
            school: user.school ? { name: user.school.name } : null,
            weekKey,
            label: weekLabel(weekKey),
            resetsAt: weekEndMillis(weekKey),
            participants,
            entries: entries.map((entry) => ({ ...publicEntry(entry), me: entry.uid === user.uid })),
            me: me ? publicEntry(me) : null,
            mostImproved: improved ? { ...improved, me: improved.uid === user.uid } : null,
            previous: previous.participants > 0 || previous.finalized ? {
                weekKey: lastWeek,
                label: weekLabel(lastWeek),
                participants: previous.participants,
                top: previous.top.slice(0, REWARD_PLACES).map(publicEntry),
                me: previousMe ? publicEntry(previousMe) : null,
                mostImproved: previousImproved ? { ...previousImproved, me: previousImproved.uid === user.uid } : null,
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

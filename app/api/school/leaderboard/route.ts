import { NextRequest, NextResponse } from "next/server";
import { failure, ok } from "@/lib/api-response";
import { isLeaderboardClass, leaderboardWeekKey, previousWeekKey, REWARD_PLACES, weekEndMillis, weekLabel } from "@/lib/leaderboard";
import { boardSummary, countParticipants, ensureWeekFinalized, mostImprovedFor, publicEntry, readBoard } from "@/lib/leaderboard-server";
import { requireSchoolStaff } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/**
 * The school's own leaderboard for one class (Class 6, 7 or 8): this week's standings, the most
 * improved student, and last week's top places. Students of a school compete only with each other.
 */
export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const classLevel = Number(request.nextUrl.searchParams.get("class") ?? 6);
        if (!isLeaderboardClass(classLevel)) return NextResponse.json({ success: false, error: "Choose Class 6, 7 or 8" }, { status: 400 });
        const now = new Date();
        try {
            await ensureWeekFinalized(now);
        } catch (error) {
            console.error("Could not close last week's leaderboard", error);
        }
        const weekKey = leaderboardWeekKey(now);
        const lastWeek = previousWeekKey(weekKey);
        const [entries, participants, improved, previous, previousImproved] = await Promise.all([
            readBoard(weekKey, classLevel, scope.schoolId),
            countParticipants(weekKey, classLevel, scope.schoolId),
            mostImprovedFor(weekKey, classLevel, scope.schoolId),
            boardSummary(lastWeek, classLevel, scope.schoolId),
            mostImprovedFor(lastWeek, classLevel, scope.schoolId),
        ]);
        return ok({
            classLevel,
            weekKey,
            label: weekLabel(weekKey),
            resetsAt: weekEndMillis(weekKey),
            participants,
            entries: entries.map(publicEntry),
            mostImproved: improved,
            previous: {
                label: weekLabel(lastWeek),
                participants: previous.participants,
                top: previous.top.slice(0, REWARD_PLACES).map(publicEntry),
                mostImproved: previousImproved,
            },
        });
    } catch (error) {
        return failure(error, "The leaderboard could not be loaded");
    }
}

import { FieldValue, type DocumentSnapshot, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import {
    LEADERBOARD_CLASSES, LEADERBOARD_SIZE, REWARD_PLACES, isLeaderboardClass, leaderboardWeekKey, minutesIntoWeek, previousWeekKey, rankKey,
    type LeaderboardClass, type LeaderboardEntry, type PointEvent, type PointsGrant, type RankedEntry, type RewardCandidate, type RewardStatus, type RewardWinner,
} from "@/lib/leaderboard";
import { resultsNotification, rewardNotification } from "@/lib/notifications";
import { notifyEach } from "@/lib/notifications-server";

/** How many of the top students are kept as reward candidates, so the admin can skip a few. */
const CANDIDATE_COUNT = 10;

export const boardRef = (weekKey: string, classLevel: number) => adminDb.collection("leaderboards").doc(`${weekKey}_${classLevel}`);
export const entryRef = (weekKey: string, classLevel: number, uid: string) => boardRef(weekKey, classLevel).collection("entries").doc(uid);
export const rewardRef = (weekKey: string, classLevel: number) => adminDb.collection("weeklyRewards").doc(`${weekKey}_${classLevel}`);

function toMillis(value: unknown): number | null {
    if (value && typeof value === "object" && typeof (value as { toMillis?: () => number }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
    }
    return typeof value === "number" ? value : null;
}

export function toEntry(doc: DocumentSnapshot): LeaderboardEntry | null {
    const data = doc.data();
    if (!data) return null;
    return {
        uid: doc.id,
        name: String(data.name ?? "Student"),
        classLevel: Number(data.classLevel) as LeaderboardClass,
        weekKey: String(data.weekKey ?? ""),
        points: Number(data.points ?? 0),
        correctAnswers: Number(data.correctAnswers ?? 0),
        rankKey: Number(data.rankKey ?? 0),
        lastScoredAt: toMillis(data.lastScoredAt) ?? 0,
    };
}

/** Public shape of a board row; emails and flags stay on the admin side. */
export function publicEntry(entry: RankedEntry) {
    return { uid: entry.uid, name: entry.name, points: entry.points, correctAnswers: entry.correctAnswers, rank: entry.rank };
}

/**
 * Inside a transaction, after every read: adds a grant to the student's week entry and
 * writes the point history. Event ids are stable, so a replayed request changes nothing.
 */
export function applyPointsGrant(transaction: Transaction, input: {
    uid: string;
    name: string;
    classLevel: LeaderboardClass;
    weekKey: string;
    now: Date;
    existing: LeaderboardEntry | null;
    grant: PointsGrant;
}): LeaderboardEntry | null {
    const { uid, name, classLevel, weekKey, now, existing, grant } = input;
    if (!grant.events.length || grant.points <= 0) return existing;
    const points = (existing?.points ?? 0) + grant.points;
    const correctAnswers = (existing?.correctAnswers ?? 0) + grant.correctAnswers;
    const entry: LeaderboardEntry = {
        uid, name, classLevel, weekKey, points, correctAnswers,
        rankKey: rankKey(points, correctAnswers, minutesIntoWeek(now, weekKey)),
        lastScoredAt: now.getTime(),
    };
    transaction.set(entryRef(weekKey, classLevel, uid), { ...entry, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(boardRef(weekKey, classLevel), { weekKey, classLevel, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    const history = adminDb.collection("students").doc(uid).collection("pointEvents");
    for (const event of grant.events) {
        transaction.set(history.doc(event.id), { ...event, weekKey, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return entry;
}

async function readEntries(weekKey: string, classLevel: number, limit?: number): Promise<RankedEntry[]> {
    let query = boardRef(weekKey, classLevel).collection("entries").orderBy("rankKey", "desc");
    if (limit) query = query.limit(limit);
    const snapshot = await query.get();
    return snapshot.docs.map((doc, index) => ({ ...toEntry(doc)!, rank: index + 1 }));
}

export async function readBoard(weekKey: string, classLevel: number, limit = LEADERBOARD_SIZE): Promise<RankedEntry[]> {
    return readEntries(weekKey, classLevel, limit);
}

export async function countParticipants(weekKey: string, classLevel: number): Promise<number> {
    const result = await boardRef(weekKey, classLevel).collection("entries").count().get();
    return result.data().count;
}

/** A student's own row with its rank, even far below the listed top. */
export async function standingFor(weekKey: string, classLevel: number, uid: string): Promise<RankedEntry | null> {
    const doc = await entryRef(weekKey, classLevel, uid).get();
    const entry = toEntry(doc);
    if (!entry) return null;
    const above = await boardRef(weekKey, classLevel).collection("entries").where("rankKey", ">", entry.rankKey).count().get();
    return { ...entry, rank: above.data().count + 1 };
}

export interface BoardSummary {
    weekKey: string;
    classLevel: number;
    finalized: boolean;
    finalizedAt: number | null;
    participants: number;
    top: RankedEntry[];
}

/** The board as students and admins see it: the frozen snapshot once a week is closed, live before. */
export async function boardSummary(weekKey: string, classLevel: number): Promise<BoardSummary> {
    const doc = await boardRef(weekKey, classLevel).get();
    const data = doc.data();
    if (data?.finalized === true) {
        return {
            weekKey, classLevel, finalized: true, finalizedAt: toMillis(data.finalizedAt),
            participants: Number(data.participants ?? 0),
            top: (Array.isArray(data.top) ? data.top : []) as RankedEntry[],
        };
    }
    const [top, participants] = await Promise.all([readBoard(weekKey, classLevel), countParticipants(weekKey, classLevel)]);
    return { weekKey, classLevel, finalized: false, finalizedAt: null, participants, top };
}

export interface StudentMeta {
    name: string;
    email: string;
    paid: boolean;
    banned: boolean;
    suspicious: boolean;
    note: string;
}

export async function studentsMeta(uids: string[]): Promise<Map<string, StudentMeta>> {
    const unique = [...new Set(uids)];
    if (!unique.length) return new Map();
    const docs = await adminDb.getAll(...unique.map((uid) => adminDb.collection("students").doc(uid)));
    return new Map(docs.map((doc) => {
        const data = doc.data() ?? {};
        return [doc.id, {
            name: String(data.name ?? "Student"),
            email: String(data.email ?? ""),
            paid: data.membership?.paid === true,
            banned: data.leaderboardFlags?.banned === true,
            suspicious: data.leaderboardFlags?.suspicious === true,
            note: String(data.leaderboardFlags?.note ?? ""),
        }];
    }));
}

export interface WeeklyReward {
    weekKey: string;
    classLevel: number;
    status: RewardStatus;
    candidates: RewardCandidate[];
    winners: RewardWinner[];
    approvedAt: number | null;
    approvedBy: string | null;
}

export async function rewardSummary(weekKey: string, classLevel: number): Promise<WeeklyReward | null> {
    const doc = await rewardRef(weekKey, classLevel).get();
    const data = doc.data();
    if (!data) return null;
    return {
        weekKey, classLevel,
        status: data.status === "approved" ? "approved" : "pending",
        candidates: Array.isArray(data.candidates) ? data.candidates : [],
        winners: Array.isArray(data.winners) ? data.winners : [],
        approvedAt: toMillis(data.approvedAt),
        approvedBy: typeof data.approvedBy === "string" ? data.approvedBy : null,
    };
}

async function buildCandidates(entries: RankedEntry[]): Promise<RewardCandidate[]> {
    const top = entries.slice(0, CANDIDATE_COUNT);
    const meta = await studentsMeta(top.map((entry) => entry.uid));
    return top.map((entry) => {
        const info = meta.get(entry.uid);
        return {
            uid: entry.uid, name: info?.name ?? entry.name, rank: entry.rank, points: entry.points, correctAnswers: entry.correctAnswers,
            paid: info?.paid ?? false, banned: info?.banned ?? false, suspicious: info?.suspicious ?? false,
        };
    });
}

/**
 * Closes one class's week: freezes the top of the board, opens the reward decision for the
 * admin and tells every participant where they finished. Safe to call again; a closed week
 * is left alone.
 */
export async function finalizeClassWeek(weekKey: string, classLevel: number): Promise<{ finalized: boolean; participants: number }> {
    const board = boardRef(weekKey, classLevel);
    if ((await board.get()).data()?.finalized === true) return { finalized: false, participants: 0 };
    const entries = await readEntries(weekKey, classLevel);
    const candidates = await buildCandidates(entries);

    const written = await adminDb.runTransaction(async (transaction) => {
        const [fresh, reward] = await Promise.all([transaction.get(board), transaction.get(rewardRef(weekKey, classLevel))]);
        if (fresh.data()?.finalized === true) return false;
        transaction.set(board, {
            weekKey, classLevel, finalized: true, finalizedAt: FieldValue.serverTimestamp(),
            participants: entries.length,
            top: entries.slice(0, LEADERBOARD_SIZE).map((entry) => ({ ...entry })),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (!reward.exists) {
            transaction.set(rewardRef(weekKey, classLevel), {
                weekKey, classLevel, status: "pending", candidates, winners: [],
                createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
            });
        }
        return true;
    });
    if (!written) return { finalized: false, participants: entries.length };

    try {
        await notifyEach(entries.map((entry) => ({
            uid: entry.uid,
            notification: resultsNotification(weekKey, { rank: entry.rank, points: entry.points, participants: entries.length }),
        })));
    } catch (error) {
        console.error(`Leaderboard ${weekKey} class ${classLevel}: results notifications failed`, error);
    }
    return { finalized: true, participants: entries.length };
}

export async function finalizeWeek(weekKey: string) {
    const outcomes = [];
    for (const classLevel of LEADERBOARD_CLASSES) {
        outcomes.push({ classLevel, ...(await finalizeClassWeek(weekKey, classLevel)) });
    }
    return outcomes;
}

/** Called on the way into any board read: closes last week once the new week has begun. */
export async function ensureWeekFinalized(now: Date = new Date()): Promise<void> {
    const previous = previousWeekKey(leaderboardWeekKey(now));
    const docs = await adminDb.getAll(...LEADERBOARD_CLASSES.map((classLevel) => boardRef(previous, classLevel)));
    if (docs.every((doc) => doc.data()?.finalized === true)) return;
    await finalizeWeek(previous);
}

export class LeaderboardError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = "LeaderboardError";
    }
}

/** The admin names the winners; only paid, unflagged students may be approved. */
export async function approveWinners(weekKey: string, classLevel: number, picks: Array<{ uid: string; place: number }>, admin: { uid: string; email: string }): Promise<WeeklyReward> {
    if (!isLeaderboardClass(classLevel)) throw new LeaderboardError(400, "Class must be 6, 7 or 8");
    if (!picks.length || picks.length > REWARD_PLACES) throw new LeaderboardError(400, `Choose between 1 and ${REWARD_PLACES} winners`);
    const places = picks.map((pick) => pick.place);
    if (new Set(places).size !== places.length || places.some((place) => !Number.isInteger(place) || place < 1 || place > REWARD_PLACES)) {
        throw new LeaderboardError(400, "Each winner needs a different place from 1 to 3");
    }
    if (new Set(picks.map((pick) => pick.uid)).size !== picks.length) throw new LeaderboardError(400, "A student can win one place only");

    const summary = await boardSummary(weekKey, classLevel);
    if (!summary.finalized) throw new LeaderboardError(409, "This week is still running; close it first");
    const byUid = new Map(summary.top.map((entry) => [entry.uid, entry]));
    const meta = await studentsMeta(picks.map((pick) => pick.uid));
    const winners: RewardWinner[] = picks
        .sort((left, right) => left.place - right.place)
        .map((pick) => {
            const entry = byUid.get(pick.uid);
            const info = meta.get(pick.uid);
            if (!entry || !info) throw new LeaderboardError(400, `${info?.name ?? pick.uid} is not on this week's board`);
            if (info.banned || info.suspicious) throw new LeaderboardError(409, `${info.name} is flagged; review the account before approving`);
            if (!info.paid) throw new LeaderboardError(409, `${info.name} is not marked as a paid member`);
            return { uid: pick.uid, name: info.name, place: pick.place, rank: entry.rank, points: entry.points, delivered: false, deliveredAt: null };
        });

    await rewardRef(weekKey, classLevel).set({
        weekKey, classLevel, status: "approved", winners,
        approvedBy: admin.uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAuditLog({
        actorUid: admin.uid, actorEmail: admin.email, action: "leaderboard.rewards.approve", targetType: "weeklyReward", targetId: `${weekKey}_${classLevel}`,
        summary: `Approved Class ${classLevel} winners for the week of ${weekKey}: ${winners.map((winner) => `${winner.place}. ${winner.name}`).join(", ")}`,
    });
    try {
        await notifyEach(winners.map((winner) => ({ uid: winner.uid, notification: rewardNotification(weekKey, winner.place) })));
    } catch (error) {
        console.error(`Reward notifications failed for ${weekKey} class ${classLevel}`, error);
    }
    return (await rewardSummary(weekKey, classLevel))!;
}

export async function setRewardDelivered(weekKey: string, classLevel: number, uid: string, delivered: boolean, admin: { uid: string; email: string }): Promise<WeeklyReward> {
    const current = await rewardSummary(weekKey, classLevel);
    if (!current || current.status !== "approved") throw new LeaderboardError(409, "Approve the winners first");
    if (!current.winners.some((winner) => winner.uid === uid)) throw new LeaderboardError(404, "That student is not a winner this week");
    const winners = current.winners.map((winner) => (winner.uid === uid ? { ...winner, delivered, deliveredAt: delivered ? Date.now() : null } : winner));
    await rewardRef(weekKey, classLevel).set({ winners, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAuditLog({
        actorUid: admin.uid, actorEmail: admin.email, action: delivered ? "leaderboard.rewards.delivered" : "leaderboard.rewards.undelivered",
        targetType: "weeklyReward", targetId: `${weekKey}_${classLevel}`, summary: `${delivered ? "Marked" : "Unmarked"} reward delivered for ${uid}`,
    });
    return (await rewardSummary(weekKey, classLevel))!;
}

export async function setStudentFlags(uid: string, flags: { banned?: boolean; suspicious?: boolean; note?: string }, admin: { uid: string; email: string }): Promise<StudentMeta> {
    const ref = adminDb.collection("students").doc(uid);
    if (!(await ref.get()).exists) throw new LeaderboardError(404, "Student not found");
    await ref.set({
        leaderboardFlags: {
            ...(typeof flags.banned === "boolean" ? { banned: flags.banned } : {}),
            ...(typeof flags.suspicious === "boolean" ? { suspicious: flags.suspicious } : {}),
            ...(typeof flags.note === "string" ? { note: flags.note.slice(0, 300) } : {}),
            updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid,
        },
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await writeAuditLog({
        actorUid: admin.uid, actorEmail: admin.email, action: "leaderboard.flags", targetType: "student", targetId: uid,
        summary: `Leaderboard flags: ${JSON.stringify({ banned: flags.banned, suspicious: flags.suspicious })}`,
    });
    return (await studentsMeta([uid])).get(uid)!;
}

export async function setMembership(uid: string, paid: boolean, admin: { uid: string; email: string }): Promise<StudentMeta> {
    const ref = adminDb.collection("students").doc(uid);
    if (!(await ref.get()).exists) throw new LeaderboardError(404, "Student not found");
    await ref.set({ membership: { paid, updatedAt: FieldValue.serverTimestamp(), updatedBy: admin.uid }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await writeAuditLog({
        actorUid: admin.uid, actorEmail: admin.email, action: "membership.set", targetType: "student", targetId: uid,
        summary: `Marked ${paid ? "paid" : "not paid"} member`,
    });
    return (await studentsMeta([uid])).get(uid)!;
}

export interface PointHistoryItem extends PointEvent {
    weekKey: string;
    createdAt: number | null;
}

export async function pointHistory(uid: string, limit = 60): Promise<PointHistoryItem[]> {
    const snapshot = await adminDb.collection("students").doc(uid).collection("pointEvents").orderBy("createdAt", "desc").limit(limit).get();
    return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            id: doc.id, kind: data.kind, points: Number(data.points ?? 0), correctAnswers: Number(data.correctAnswers ?? 0),
            label: String(data.label ?? ""), sessionId: data.sessionId, microTag: data.microTag, topicId: data.topicId, homeworkId: data.homeworkId,
            weekKey: String(data.weekKey ?? ""), createdAt: toMillis(data.createdAt),
        };
    });
}

/** Past weeks' reward decisions, newest first, across the classes. */
export async function rewardHistory(limit = 24): Promise<WeeklyReward[]> {
    const snapshot = await adminDb.collection("weeklyRewards").orderBy("weekKey", "desc").limit(limit).get();
    return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            weekKey: String(data.weekKey), classLevel: Number(data.classLevel),
            status: data.status === "approved" ? "approved" : "pending",
            candidates: Array.isArray(data.candidates) ? data.candidates : [],
            winners: Array.isArray(data.winners) ? data.winners : [],
            approvedAt: toMillis(data.approvedAt), approvedBy: typeof data.approvedBy === "string" ? data.approvedBy : null,
        };
    });
}


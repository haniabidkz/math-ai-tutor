import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { resolveStudentAccess, type AccessSettings } from "@/lib/access";
import { activityDateKey } from "@/lib/gamification";
import { MISCONCEPTIONS } from "@/lib/mistake-analysis";
import type { School } from "@/types/school";
import type { MisconceptionTag } from "@/types/curriculum";

/**
 * Platform analytics written as a side effect of normal use: one document per active user
 * per day, and running counts per question and per misconception. Every writer swallows its
 * own errors, so a counter can never fail a quiz.
 */

const DAY_MS = 86_400_000;
const MAX_SCAN = 20_000;

export function dateKeysBack(days: number, now = new Date()): string[] {
    const keys: string[] = [];
    for (let index = 0; index < days; index += 1) keys.push(activityDateKey(new Date(now.getTime() - index * DAY_MS)));
    return keys;
}

/** Marks the user active today, once a day; later calls on the same day change nothing. */
export async function recordActivity(input: {
    uid: string;
    collection: "students" | "teachers" | "parents" | "schoolAdmins";
    role: string;
    schoolId: string | null;
    classLevel?: number | null;
    lastActiveDate: unknown;
    now?: Date;
}): Promise<void> {
    const today = activityDateKey(input.now ?? new Date());
    if (input.lastActiveDate === today) return;
    try {
        const batch = adminDb.batch();
        batch.set(adminDb.collection(input.collection).doc(input.uid), { lastActiveDate: today, lastActiveAt: FieldValue.serverTimestamp() }, { merge: true });
        batch.set(adminDb.collection("activityLog").doc(`${today}_${input.uid}`), {
            date: today,
            uid: input.uid,
            role: input.role,
            schoolId: input.schoolId ?? null,
            classLevel: input.classLevel ?? null,
            firstAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await batch.commit();
    } catch (error) {
        console.error("Activity could not be recorded", error);
    }
}

/** Counts an answer against its question and, when it was wrong, against the misconception. */
export async function recordAnswerStats(input: {
    questionId: string;
    microTag: string;
    classLevel: number;
    isCorrect: boolean;
    misconceptionTag?: string | null;
}): Promise<void> {
    try {
        const batch = adminDb.batch();
        batch.set(adminDb.collection("questionStats").doc(input.questionId), {
            questionId: input.questionId,
            microTag: input.microTag,
            classLevel: input.classLevel,
            attempts: FieldValue.increment(1),
            wrong: FieldValue.increment(input.isCorrect ? 0 : 1),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (!input.isCorrect && input.misconceptionTag) {
            batch.set(adminDb.collection("misconceptionStats").doc(input.misconceptionTag), {
                tag: input.misconceptionTag,
                count: FieldValue.increment(1),
                byMicroTag: { [input.microTag]: FieldValue.increment(1) },
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        await batch.commit();
    } catch (error) {
        console.error("Answer statistics could not be recorded", error);
    }
}

export interface ActivityWindow {
    days: number;
    activeUsers: number;
    activeStudents: number;
    /** Students active on at least three different days in the window. */
    regularStudents: number;
}

export interface PlatformAnalytics {
    generatedAt: number;
    today: string;
    dau: number;
    dauStudents: number;
    windows: ActivityWindow[];
    /** Active students per day for the last 14 days, oldest first. */
    dailyActive: Array<{ date: string; students: number; users: number }>;
    users: {
        students: number;
        teachers: number;
        parents: number;
        schoolAdmins: number;
        schools: number;
        schoolStudents: number;
        individualStudents: number;
        paidStudents: number;
        freeStudents: number;
        diagnosticCompleted: number;
        diagnosticDropOffs: number;
        oneLessonCompleters: number;
        quizCompleters: number;
        signups7d: number;
        signups30d: number;
        byClass: Record<string, number>;
    };
    schools: { trial: number; paid: number; expired: number; suspended: number };
    failedQuestions: Array<{ id: string; microTag: string; classLevel: number; attempts: number; wrong: number; wrongRate: number; question: string }>;
    misconceptions: Array<{ tag: string; label: string; count: number; topLessons: Array<{ microTag: string; count: number }> }>;
}

function millis(value: unknown): number | null {
    if (value && typeof value === "object" && typeof (value as { toMillis?: () => number }).toMillis === "function") return (value as { toMillis: () => number }).toMillis();
    return typeof value === "number" ? value : null;
}

async function activityIn(keys: string[]) {
    // Firestore allows up to 30 values in one "in" filter; 30 days is the longest window.
    const snapshot = await adminDb.collection("activityLog").where("date", "in", keys).select("uid", "date", "role").limit(MAX_SCAN).get();
    return snapshot.docs.map((doc) => doc.data() as { uid: string; date: string; role: string });
}

function summarizeWindow(days: number, rows: Array<{ uid: string; date: string; role: string }>): ActivityWindow {
    const daysByUid = new Map<string, Set<string>>();
    const roles = new Map<string, string>();
    for (const row of rows) {
        daysByUid.set(row.uid, (daysByUid.get(row.uid) ?? new Set()).add(row.date));
        roles.set(row.uid, row.role);
    }
    const students = [...daysByUid.entries()].filter(([uid]) => roles.get(uid) === "student");
    return {
        days,
        activeUsers: daysByUid.size,
        activeStudents: students.length,
        regularStudents: students.filter(([, dates]) => dates.size >= 3).length,
    };
}

/** Everything the Super Admin analytics tab shows, computed from the live data. */
export async function platformAnalytics(input: { schools: School[]; settings: AccessSettings; now?: Date }): Promise<PlatformAnalytics> {
    const now = input.now ?? new Date();
    const today = activityDateKey(now);
    const keys30 = dateKeysBack(30, now);
    const keys7 = keys30.slice(0, 7);
    const keys14 = keys30.slice(0, 14);

    const [rows30, studentsSnapshot, teachers, parents, schoolAdmins, failed, misconceptionsSnapshot] = await Promise.all([
        activityIn(keys30),
        adminDb.collection("students").select("schoolId", "class", "membership", "diagnosticCompleted", "placementCompleted", "lessonsCompleted", "quizzesCompleted", "createdAt").limit(MAX_SCAN).get(),
        adminDb.collection("teachers").count().get(),
        adminDb.collection("parents").count().get(),
        adminDb.collection("schoolAdmins").count().get(),
        adminDb.collection("questionStats").orderBy("wrong", "desc").limit(15).get(),
        adminDb.collection("misconceptionStats").orderBy("count", "desc").limit(10).get(),
    ]);

    const rows7 = rows30.filter((row) => keys7.includes(row.date));
    const todayRows = rows30.filter((row) => row.date === today);
    const dailyActive = [...keys14].reverse().map((date) => {
        const rows = rows30.filter((row) => row.date === date);
        return { date, users: new Set(rows.map((row) => row.uid)).size, students: new Set(rows.filter((row) => row.role === "student").map((row) => row.uid)).size };
    });

    const schoolsById = new Map(input.schools.map((school) => [school.id, school]));
    const sevenDaysAgo = now.getTime() - 7 * DAY_MS;
    const thirtyDaysAgo = now.getTime() - 30 * DAY_MS;
    const users = {
        students: studentsSnapshot.size,
        teachers: teachers.data().count,
        parents: parents.data().count,
        schoolAdmins: schoolAdmins.data().count,
        schools: input.schools.length,
        schoolStudents: 0,
        individualStudents: 0,
        paidStudents: 0,
        freeStudents: 0,
        diagnosticCompleted: 0,
        diagnosticDropOffs: 0,
        oneLessonCompleters: 0,
        quizCompleters: 0,
        signups7d: 0,
        signups30d: 0,
        byClass: {} as Record<string, number>,
    };
    for (const doc of studentsSnapshot.docs) {
        const data = doc.data();
        const schoolId = typeof data.schoolId === "string" ? data.schoolId : null;
        const school = schoolId ? schoolsById.get(schoolId) ?? null : null;
        if (schoolId) users.schoolStudents += 1; else users.individualStudents += 1;
        const access = resolveStudentAccess({
            membershipPaid: data.membership?.paid,
            schoolId,
            school: school ? { plan: school.plan, trialEndsAt: school.trialEndsAt, paidUntil: school.paidUntil, trialFullAccess: school.trialFullAccess, status: school.status } : null,
            settings: input.settings,
            now: now.getTime(),
        });
        if (access.premium) users.paidStudents += 1; else users.freeStudents += 1;
        const diagnosticDone = data.diagnosticCompleted === true || data.placementCompleted === true;
        if (diagnosticDone) users.diagnosticCompleted += 1; else users.diagnosticDropOffs += 1;
        if (Number(data.lessonsCompleted ?? 0) >= 1) users.oneLessonCompleters += 1;
        if (Number(data.quizzesCompleted ?? 0) >= 1) users.quizCompleters += 1;
        const created = millis(data.createdAt);
        if (created !== null && created >= sevenDaysAgo) users.signups7d += 1;
        if (created !== null && created >= thirtyDaysAgo) users.signups30d += 1;
        const classKey = String(data.class ?? "?");
        users.byClass[classKey] = (users.byClass[classKey] ?? 0) + 1;
    }

    const schools = { trial: 0, paid: 0, expired: 0, suspended: 0 };
    for (const school of input.schools) {
        if (school.status === "suspended") schools.suspended += 1;
        schools[school.effectivePlan] += 1;
    }

    const questionRefs = failed.docs.map((doc) => adminDb.collection("questions").doc(doc.id));
    const questionDocs = questionRefs.length ? await adminDb.getAll(...questionRefs) : [];
    const questionText = new Map(questionDocs.map((doc) => [doc.id, String(doc.data()?.question?.english ?? "")]));
    const failedQuestions = failed.docs.map((doc) => {
        const data = doc.data();
        const attempts = Number(data.attempts ?? 0);
        const wrong = Number(data.wrong ?? 0);
        return {
            id: doc.id,
            microTag: String(data.microTag ?? ""),
            classLevel: Number(data.classLevel ?? 0),
            attempts,
            wrong,
            wrongRate: attempts ? Math.round((wrong / attempts) * 100) : 0,
            question: questionText.get(doc.id) ?? "(question removed)",
        };
    });

    const misconceptions = misconceptionsSnapshot.docs.map((doc) => {
        const data = doc.data();
        const byMicroTag = (data.byMicroTag ?? {}) as Record<string, number>;
        const definition = MISCONCEPTIONS[doc.id as MisconceptionTag];
        return {
            tag: doc.id,
            label: definition?.label.english ?? doc.id,
            count: Number(data.count ?? 0),
            topLessons: Object.entries(byMicroTag).map(([microTag, count]) => ({ microTag, count: Number(count) })).sort((left, right) => right.count - left.count).slice(0, 3),
        };
    });

    return {
        generatedAt: now.getTime(),
        today,
        dau: new Set(todayRows.map((row) => row.uid)).size,
        dauStudents: new Set(todayRows.filter((row) => row.role === "student").map((row) => row.uid)).size,
        windows: [summarizeWindow(7, rows7), summarizeWindow(30, rows30)],
        dailyActive,
        users,
        schools,
        failedQuestions,
        misconceptions,
    };
}

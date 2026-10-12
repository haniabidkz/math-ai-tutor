import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { toDiagnosticSummary } from "@/lib/diagnostic-summary";
import { effectiveTeacherClasses } from "@/lib/homework";
import { authErrorResponse, requireUser } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

/** How many students' progress is read at the same time. */
const CONCURRENCY = 25;

function toIso(value: unknown): string {
    if (value && typeof value === "object" && typeof (value as { toDate?: () => Date }).toDate === "function") {
        return (value as { toDate: () => Date }).toDate().toISOString();
    }
    return typeof value === "string" ? value : "";
}

/**
 * The students a teacher may see, with their topic progress and quiz results, read on the
 * server in parallel. The teacher pages used to fetch every student's subcollections one by
 * one from the browser, which took minutes once the school grew and left the page spinning.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["teacher", "super_admin"]);
        const teacher = user.role === "teacher" ? (await adminDb.collection("teachers").doc(user.uid).get()).data() : null;
        const classes = user.role === "teacher" ? effectiveTeacherClasses(teacher?.assignedClasses) : [6, 7, 8];

        const snapshot = await adminDb.collection("students").where("class", "in", classes).get();
        const students = snapshot.docs.map((doc) => ({ uid: doc.id, data: doc.data() }));

        const results: Array<Record<string, unknown>> = [];
        for (let start = 0; start < students.length; start += CONCURRENCY) {
            const slice = students.slice(start, start + CONCURRENCY);
            const loaded = await Promise.all(slice.map(async ({ uid, data }) => {
                const ref = adminDb.collection("students").doc(uid);
                const [progress, quizzes] = await Promise.all([ref.collection("topicProgress").get(), ref.collection("quizResults").get()]);
                return {
                    uid,
                    name: typeof data.name === "string" && data.name.trim() ? data.name : (typeof data.email === "string" ? data.email.split("@")[0] : "Student"),
                    email: typeof data.email === "string" ? data.email : "",
                    class: Number(data.class) || 0,
                    parentEmail: typeof data.parentEmail === "string" ? data.parentEmail : undefined,
                    adaptive_level: data.adaptive_level,
                    diagnostic: toDiagnosticSummary(data.diagnosticProfile),
                    topicProgress: progress.docs.map((doc) => {
                        const item = doc.data();
                        return {
                            topicId: typeof item.topicId === "string" ? item.topicId : doc.id,
                            topicName: typeof item.topicName === "string" ? item.topicName : doc.id,
                            teachingLevel: Number(item.teachingLevel ?? 1),
                            teachingAttempts: Number(item.teachingAttempts ?? 0),
                            needsHumanAttention: item.needsHumanAttention === true,
                            understood: item.understood === true,
                            understandingLevel: item.understandingLevel,
                            quizScore: item.quizScore,
                            quizMaxScore: item.quizMaxScore,
                            updatedAt: toIso(item.updatedAt),
                        };
                    }),
                    quizResults: quizzes.docs.map((doc) => {
                        const item = doc.data();
                        return {
                            sessionId: doc.id,
                            topicName: typeof item.topicName === "string" ? item.topicName : "",
                            score: Number(item.score ?? 0),
                            maxScore: Number(item.maxScore ?? 0),
                            percentage: Number(item.percentage ?? 0),
                            understandingLevel: typeof item.understandingLevel === "string" ? item.understandingLevel : "",
                            totalHintsUsed: Number(item.totalHintsUsed ?? 0),
                            totalTimeSeconds: Number(item.totalTimeSeconds ?? 0),
                            completedAt: toIso(item.completedAt),
                        };
                    }),
                };
            }));
            results.push(...loaded);
        }
        results.sort((left, right) => Number(left.class) - Number(right.class) || String(left.name).localeCompare(String(right.name)));

        return NextResponse.json({ success: true, classes, students: results });
    } catch (error) {
        const auth = authErrorResponse(error);
        if (auth) return NextResponse.json(auth.body, { status: auth.status });
        console.error("Teacher students failed", error);
        return NextResponse.json({ success: false, error: "The student list could not be loaded. Please try again." }, { status: 500 });
    }
}

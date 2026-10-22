import { NextRequest, NextResponse } from "next/server";
import { resolveStudentAccess } from "@/lib/access";
import { adminDb } from "@/lib/firebase-admin";
import { toDiagnosticSummary } from "@/lib/diagnostic-summary";
import { effectiveTeacherClasses } from "@/lib/homework";
import { displayContact } from "@/lib/phone";
import { getAccessSettings, listSections, schoolPlanInfo } from "@/lib/schools-server";
import { authErrorResponse, requireUser, type AuthenticatedUser } from "@/lib/server-auth";

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
 * Which students a teacher may see. A school teacher sees their school only, narrowed to
 * their sections when the admin assigned some; an individual teacher sees individual
 * students in their classes, as before schools existed; the super admin sees everyone.
 */
async function visibleStudents(user: AuthenticatedUser) {
    const profile = user.profile ?? {};
    const classes = user.role === "teacher" ? effectiveTeacherClasses(profile.assignedClasses) : [6, 7, 8];
    const sectionIds = Array.isArray(profile.assignedSectionIds) && profile.assignedSectionIds.length ? profile.assignedSectionIds.map(String) : null;
    if (user.role === "teacher" && user.schoolId) {
        const snapshot = await adminDb.collection("students").where("schoolId", "==", user.schoolId).get();
        const docs = snapshot.docs.filter((doc) => {
            const data = doc.data();
            if (data.schoolStatus === "graduated") return false;
            if (!classes.includes(Number(data.class) as 6 | 7 | 8)) return false;
            return !sectionIds || (typeof data.sectionId === "string" && sectionIds.includes(data.sectionId));
        });
        return { classes, docs };
    }
    const snapshot = await adminDb.collection("students").where("class", "in", classes).get();
    const docs = user.role === "teacher" ? snapshot.docs.filter((doc) => !doc.data().schoolId) : snapshot.docs;
    return { classes, docs };
}

/**
 * The students a teacher may see, with their topic progress and quiz results, read on the
 * server in parallel. The teacher pages used to fetch every student's subcollections one by
 * one from the browser, which took minutes once the school grew and left the page spinning.
 */
export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["teacher", "super_admin"]);
        const [{ classes, docs }, settings, sections] = await Promise.all([
            visibleStudents(user),
            getAccessSettings(),
            user.schoolId ? listSections(user.schoolId) : Promise.resolve([]),
        ]);
        const plan = schoolPlanInfo(user.school);
        const students = docs.map((doc) => ({ uid: doc.id, data: doc.data() }));

        const results: Array<Record<string, unknown>> = [];
        for (let start = 0; start < students.length; start += CONCURRENCY) {
            const slice = students.slice(start, start + CONCURRENCY);
            const loaded = await Promise.all(slice.map(async ({ uid, data }) => {
                const ref = adminDb.collection("students").doc(uid);
                const [progress, quizzes] = await Promise.all([ref.collection("topicProgress").get(), ref.collection("quizResults").get()]);
                const schoolId = typeof data.schoolId === "string" && data.schoolId ? data.schoolId : null;
                const access = resolveStudentAccess({ membershipPaid: data.membership?.paid, schoolId, school: schoolId === user.schoolId ? plan : null, settings });
                return {
                    uid,
                    name: typeof data.name === "string" && data.name.trim() ? data.name : (typeof data.email === "string" ? data.email.split("@")[0] : "Student"),
                    email: typeof data.email === "string" ? data.email : "",
                    contact: displayContact(data),
                    phone: typeof data.phone === "string" ? data.phone : null,
                    class: Number(data.class) || 0,
                    sectionId: typeof data.sectionId === "string" ? data.sectionId : null,
                    sectionLabel: typeof data.sectionLabel === "string" ? data.sectionLabel : null,
                    paid: data.membership?.paid === true,
                    premium: access.premium,
                    parentEmail: typeof data.parentEmail === "string" ? data.parentEmail : undefined,
                    parentPhone: typeof data.parentPhone === "string" ? data.parentPhone : undefined,
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
        results.sort((left, right) => Number(left.class) - Number(right.class) || String(left.sectionLabel ?? "").localeCompare(String(right.sectionLabel ?? "")) || String(left.name).localeCompare(String(right.name)));

        const assignedSectionIds = Array.isArray(user.profile?.assignedSectionIds) ? user.profile!.assignedSectionIds.map(String) : [];
        return NextResponse.json({
            success: true,
            classes,
            students: results,
            school: user.school ? {
                id: user.school.id, name: user.school.name, code: user.school.code, plan: user.school.effectivePlan,
                trialDaysLeft: user.school.trialDaysLeft, seatsUsed: user.school.seatsUsed, seatLimit: user.school.seatLimit,
            } : null,
            sections: assignedSectionIds.length ? sections.filter((section) => assignedSectionIds.includes(section.id)) : sections,
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        if (auth) return NextResponse.json(auth.body, { status: auth.status });
        console.error("Teacher students failed", error);
        return NextResponse.json({ success: false, error: "The student list could not be loaded. Please try again." }, { status: 500 });
    }
}

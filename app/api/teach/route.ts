import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getPublishedConcept, getPublishedQuestions, getRuntimeConcepts, localized } from "@/lib/assessment-content";
import { buildConceptItems } from "@/lib/learner-metrics";
import { getClassConcepts, getConcept } from "@/lib/curriculum";
import { PREMIUM_LOCK_CODE, premiumLockMessage } from "@/lib/access";
import { adminDb } from "@/lib/firebase-admin";
import { accessForStudent } from "@/lib/schools-server";
import { LESSON_STEPS, pickPractice, toPracticeItem } from "@/lib/lesson-steps";
import { activityDateKey, newlyEarnedBadges, nextStreak, type StreakState } from "@/lib/gamification";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
import type { Locale, MicroConcept, StudentClassLevel } from "@/types/curriculum";

function resolveMicroTag(value: string, classLevel: number) {
    if (getConcept(value)) return value;
    if (classLevel === 6 || classLevel === 7 || classLevel === 8) {
        return getClassConcepts(classLevel as StudentClassLevel).find((concept) => concept.topicId === value)?.microTag ?? value;
    }
    return value;
}

const EXTRA_TIPS: Record<Locale, Record<1 | 2 | 3, string>> = {
    english: {
        1: "**Remember:** Write each step separately and check your answer at the end.",
        2: "**Method:** Identify known values, choose one operation, then solve one step at a time.",
        3: "**Deep check:** Substitute your answer back into the problem and verify every sign.",
    },
    "roman-urdu": {
        1: "**Yaad rakhein:** Har qadam ko alag likhein aur akhir mein apna jawab check karein.",
        2: "**Tareeqa:** Maloom qeemat pehchanein, aik amal chunein, phir qadam ba qadam hal karein.",
        3: "**Gehri jaanch:** Apna jawab sawal mein wapas rakh kar tasdeeq karein aur nishan dobara check karein.",
    },
};

/** The lesson's own quiz the student started and left, so a return goes straight back to it. */
async function openLessonQuiz(studentRef: FirebaseFirestore.DocumentReference, microTag: string): Promise<{ questionNumber: number; totalQuestions: number } | null> {
    const snapshot = await studentRef.collection("assessmentSessions").where("kind", "==", "mastery").where("microTag", "==", microTag).get();
    const millis = (value: unknown) => (value && typeof (value as { toMillis?: () => number }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : 0);
    const open = snapshot.docs
        .map((doc) => doc.data())
        // Homework quizzes are reached from the homework card, not from the lesson.
        .filter((session) => session.status !== "completed" && !session.homeworkId && Array.isArray(session.questions) && session.questions.length > 0)
        .sort((left, right) => millis(right.updatedAt ?? right.startedAt) - millis(left.updatedAt ?? left.startedAt))[0];
    if (!open) return null;
    const total = Number(open.questionCount ?? open.questions.length);
    return { questionNumber: Math.min(Number(open.currentQuestionIndex ?? 0) + 1, total), totalQuestions: total };
}

function lessonMarkdown(concept: MicroConcept, prerequisite: MicroConcept | null, level: number, locale: Locale): string {
    const tip = EXTRA_TIPS[locale][Math.max(1, Math.min(3, level)) as 1 | 2 | 3];
    const before = prerequisite
        ? locale === "roman-urdu"
            ? `

Is se pehle **${localized(prerequisite.title, locale)}** ko samajhna madadgar hai.`
            : `

It helps to understand **${localized(prerequisite.title, locale)}** first.`
        : "";
    const example = concept.example
        ? `

**${locale === "roman-urdu" ? "Misaal" : "Example"}:** ${localized(concept.example, locale)}`
        : "";
    return `## ${localized(concept.title, locale)}

${localized(concept.concept, locale)}${example}

${tip}${before}`;
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const body = await request.json();
        const requested = String(body.microTag ?? body.topicId ?? "").trim();
        // An empty tag reached Firestore as an invalid document path and surfaced as a 500.
        if (!requested) return NextResponse.json({ success: false, error: "Choose a concept to learn" }, { status: 400 });
        const microTag = resolveMicroTag(requested, Number(body.classLevel));
        const concept = await getPublishedConcept(microTag);
        if (!concept) return NextResponse.json({ success: false, error: "Published concept not found" }, { status: 404 });

        // Lessons of the student's own class unlock one after another; a locked one says what to finish first.
        const studentRef = adminDb.collection("students").doc(user.uid);
        const [profileSnapshot, progressSnapshot, concepts] = await Promise.all([studentRef.get(), studentRef.collection("conceptProgress").get(), getRuntimeConcepts()]);
        const profile = profileSnapshot.data() ?? {};
        if (Number(profile.class) === concept.classLevel) {
            const access = await accessForStudent(profile, user.school);
            const items = buildConceptItems(concepts, concept.classLevel, new Map(progressSnapshot.docs.map((doc) => [doc.id, doc.data()])), new Set(profile.diagnosticProfile?.strongMicroTags ?? []), access);
            const item = items.find((entry) => entry.microTag === concept.microTag);
            if (item?.lockReason === "premium") {
                return NextResponse.json({ success: false, code: PREMIUM_LOCK_CODE, error: premiumLockMessage(access) }, { status: 403 });
            }
            if (item?.locked && item.blockedBy) {
                return NextResponse.json({ success: false, code: "locked", error: `Finish "${item.blockedBy.title.english}" first. Lessons unlock one after another.` }, { status: 409 });
            }
        }

        const [prerequisite, questions, lessonSnapshot, openQuiz] = await Promise.all([
            concept.prerequisiteTag ? getPublishedConcept(concept.prerequisiteTag) : null,
            // Two of the lesson's own questions for the try-it and quick-check steps; answered on the device, never scored.
            getPublishedQuestions(microTag),
            studentRef.collection("lessonProgress").doc(concept.microTag).get(),
            openLessonQuiz(studentRef, concept.microTag),
        ]);
        // A student who read the lesson and reached its questions comes back to those questions:
        // the same ones, and the screen skips the explanation they already saw.
        const saved = lessonSnapshot.data() ?? {};
        const savedStep = Number(saved.resumeStep);
        const resumeStep = Number.isInteger(savedStep) && savedStep >= 3 ? Math.min(savedStep, LESSON_STEPS.length) : null;
        const savedIds: string[] = Array.isArray(saved.practiceIds) ? saved.practiceIds.filter((id: unknown): id is string => typeof id === "string") : [];
        const keptPractice = resumeStep
            ? savedIds.map((id) => questions.find((question) => question.id === id)).filter((question): question is NonNullable<typeof question> => Boolean(question)).map(toPracticeItem)
            : [];
        const solvedIds: string[] = Array.isArray(saved.solvedPracticeIds) ? saved.solvedPracticeIds.filter((id: unknown): id is string => typeof id === "string") : [];
        const level = Math.max(1, Math.min(3, Number(body.teachingLevel ?? 1)));

        // The lesson is English; the same lesson in Roman Urdu is sent for the optional toggle.
        const content = {
            english: lessonMarkdown(concept, prerequisite ?? null, level, "english"),
            romanUrdu: lessonMarkdown(concept, prerequisite ?? null, level, "roman-urdu"),
        };
        // The same tip as plain text, for the screen that lays the lesson out in cards.
        const plainTip = (locale: Locale) => EXTRA_TIPS[locale][level as 1 | 2 | 3].replace(/^\*\*[^*]+\*\*\s*/, "");
        const tip = { english: plainTip("english"), romanUrdu: plainTip("roman-urdu") };

        return NextResponse.json({
            success: true,
            content,
            tip,
            concept: {
                microTag: concept.microTag,
                title: concept.title.english,
                topicTitle: concept.topicTitle.english,
                concept: concept.concept,
                visualKind: concept.visualKind,
                imageUrl: concept.imageUrl,
                example: concept.example ?? null,
                subTopic: concept.subTopic ?? null,
                family: concept.family,
                prerequisiteTitle: prerequisite?.title.english ?? null,
            },
            practice: keptPractice.length ? keptPractice : pickPractice(questions),
            resume: { step: resumeStep, solvedIds, openQuiz },
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load lesson" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const body = await request.json();
        const microTag = String(body.microTag ?? body.topicId ?? "");
        if (!microTag || microTag.includes("/")) return NextResponse.json({ success: false, error: "microTag is required" }, { status: 400 });
        const understood = body.understood === true;
        const studentRef = adminDb.collection("students").doc(user.uid);
        const ref = studentRef.collection("lessonProgress").doc(microTag);

        // Where the student is inside the lesson: the step, the two practice questions, and
        // the ones already solved. Nothing here counts as finishing the lesson.
        if (body.progress === true) {
            const update: Record<string, unknown> = { microTag, updatedAt: FieldValue.serverTimestamp() };
            const step = Number(body.step);
            if (Number.isInteger(step) && step >= 1 && step <= LESSON_STEPS.length) update.resumeStep = step;
            if (Array.isArray(body.practiceIds)) update.practiceIds = body.practiceIds.filter((id: unknown) => typeof id === "string" && id.length < 200).slice(0, 4);
            if (typeof body.solvedId === "string" && body.solvedId && body.solvedId.length < 200) update.solvedPracticeIds = FieldValue.arrayUnion(body.solvedId);
            await ref.set(update, { merge: true });
            return NextResponse.json({ success: true });
        }

        const result = await adminDb.runTransaction(async (transaction) => {
            const [lessonSnapshot, studentSnapshot] = await Promise.all([
                transaction.get(ref),
                transaction.get(studentRef),
            ]);
            const alreadyCompleted = lessonSnapshot.data()?.understood === true;
            const student = studentSnapshot.data() ?? {};

            transaction.set(ref, {
                microTag,
                understood,
                // The quiz takes over from here; a later visit shows the lesson from the start.
                ...(understood ? { resumeStep: FieldValue.delete(), practiceIds: FieldValue.delete(), solvedPracticeIds: FieldValue.delete() } : {}),
                teachingAttempts: FieldValue.increment(1),
                needsHumanAttention: !understood && Number(body.teachingLevel ?? 1) >= 3,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            // Only a concept finished for the first time counts toward lessons and streaks.
            if (!understood || alreadyCompleted) return null;

            const lessonsCompleted = Number(student.lessonsCompleted ?? 0) + 1;
            const streak = nextStreak(student.streak as Partial<StreakState> | undefined, activityDateKey());
            const freshBadges = newlyEarnedBadges({
                lessonsCompleted,
                quizzesCompleted: Number(student.quizzesCompleted ?? 0),
                questionsAnswered: Number(student.questionsAnswered ?? 0),
                currentStreak: streak.current,
            }, Array.isArray(student.badgeIds) ? student.badgeIds : []);

            for (const badgeId of freshBadges) {
                transaction.set(studentRef.collection("badges").doc(badgeId), {
                    badgeId,
                    earnedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
            }
            transaction.set(studentRef, {
                lessonsCompleted,
                streak,
                ...(freshBadges.length ? { badgeIds: FieldValue.arrayUnion(...freshBadges) } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });

            return { streak: streak.current, newBadges: freshBadges };
        });

        return NextResponse.json({ success: true, ...(result ?? {}) });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to update lesson progress" }, { status: 500 });
    }
}

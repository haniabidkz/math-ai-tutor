import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getPublishedConcept, localized } from "@/lib/assessment-content";
import { getClassConcepts, getConcept } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
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

function lessonMarkdown(concept: MicroConcept, prerequisite: MicroConcept | null, level: number, locale: Locale): string {
    const tip = EXTRA_TIPS[locale][Math.max(1, Math.min(3, level)) as 1 | 2 | 3];
    const before = prerequisite
        ? locale === "roman-urdu"
            ? `

Is se pehle **${localized(prerequisite.title, locale)}** ko samajhna madadgar hai.`
            : `

It helps to understand **${localized(prerequisite.title, locale)}** first.`
        : "";
    return `## ${localized(concept.title, locale)}

${localized(concept.concept, locale)}

${tip}${before}`;
}

export async function POST(request: NextRequest) {
    try {
        await requireUser(request, ["student"]);
        const body = await request.json();
        const requested = String(body.microTag ?? body.topicId ?? "").trim();
        // An empty tag reached Firestore as an invalid document path and surfaced as a 500.
        if (!requested) return NextResponse.json({ success: false, error: "Choose a concept to learn" }, { status: 400 });
        const microTag = resolveMicroTag(requested, Number(body.classLevel));
        const concept = await getPublishedConcept(microTag);
        if (!concept) return NextResponse.json({ success: false, error: "Published concept not found" }, { status: 404 });

        const prerequisite = concept.prerequisiteTag ? await getPublishedConcept(concept.prerequisiteTag) : null;
        const level = Math.max(1, Math.min(3, Number(body.teachingLevel ?? 1)));

        // The lesson is English; the same lesson in Roman Urdu is sent for the optional toggle.
        const content = {
            english: lessonMarkdown(concept, prerequisite ?? null, level, "english"),
            romanUrdu: lessonMarkdown(concept, prerequisite ?? null, level, "roman-urdu"),
        };

        return NextResponse.json({
            success: true,
            content,
            concept: {
                microTag: concept.microTag,
                title: concept.title.english,
                topicTitle: concept.topicTitle.english,
                concept: concept.concept,
                visualKind: concept.visualKind,
                imageUrl: concept.imageUrl,
            },
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
        if (!microTag) return NextResponse.json({ success: false, error: "microTag is required" }, { status: 400 });
        const understood = body.understood === true;
        const studentRef = adminDb.collection("students").doc(user.uid);
        const ref = studentRef.collection("lessonProgress").doc(microTag);

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

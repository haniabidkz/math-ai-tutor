import { NextRequest, NextResponse } from "next/server";
import { getRuntimeConcepts } from "@/lib/assessment-content";
import { adminDb } from "@/lib/firebase-admin";
import { authErrorResponse, requireVerifiedUser } from "@/lib/server-auth";
import type { StudentClassLevel } from "@/types/curriculum";

export async function GET(request: NextRequest) {
    try {
        const user = await requireVerifiedUser(request, ["student"]);
        const studentRef = adminDb.collection("students").doc(user.uid);
        const [profileSnapshot, progressSnapshot, concepts] = await Promise.all([
            studentRef.get(), studentRef.collection("conceptProgress").get(), getRuntimeConcepts(),
        ]);
        if (!profileSnapshot.exists) return NextResponse.json({ success: false, error: "Student profile not found" }, { status: 404 });
        const profile = profileSnapshot.data() ?? {};
        const classLevel = Number(profile.class) as StudentClassLevel;
        if (![6, 7, 8].includes(classLevel)) return NextResponse.json({ success: false, error: "Student class must be 6, 7, or 8" }, { status: 409 });
        const progress = new Map(progressSnapshot.docs.map((doc) => [doc.id, doc.data()]));
        const strong = new Set<string>(profile.diagnosticProfile?.strongMicroTags ?? []);
        const classConcepts = concepts
            .filter((concept) => concept.classLevel === classLevel && !concept.foundationOnly)
            .sort((left, right) => left.topicId.localeCompare(right.topicId) || left.order - right.order);
        const conceptItems = classConcepts.map((concept) => {
            const item = progress.get(concept.microTag);
            const prerequisiteInClass = classConcepts.some((candidate) => candidate.microTag === concept.prerequisiteTag);
            const prerequisiteMastered = !prerequisiteInClass || !concept.prerequisiteTag || progress.get(concept.prerequisiteTag)?.mastered === true || strong.has(concept.prerequisiteTag);
            return {
                ...concept,
                mastered: item?.mastered === true,
                percentage: Number(item?.percentage ?? 0),
                locked: !prerequisiteMastered,
            };
        });
        const topicIds = [...new Set(conceptItems.map((concept) => concept.topicId))];
        const topics = topicIds.map((topicId) => ({
            topicId,
            title: conceptItems.find((concept) => concept.topicId === topicId)?.topicTitle,
            concepts: conceptItems.filter((concept) => concept.topicId === topicId),
        }));
        const nextWeekly = profile.nextWeeklyAssessmentAt?.toDate?.() ?? (profile.nextWeeklyAssessmentAt ? new Date(profile.nextWeeklyAssessmentAt) : null);
        return NextResponse.json({
            success: true,
            profile: { name: profile.name, email: profile.email, classLevel, diagnosticCompleted: profile.diagnosticCompleted === true || profile.placementCompleted === true },
            topics,
            metrics: {
                mastered: conceptItems.filter((concept) => concept.mastered).length,
                inProgress: conceptItems.filter((concept) => !concept.mastered && concept.percentage > 0).length,
                available: conceptItems.filter((concept) => !concept.mastered && !concept.locked).length,
                total: conceptItems.length,
            },
            weeklyDue: Boolean(nextWeekly && nextWeekly.getTime() <= Date.now()),
            nextWeeklyAssessmentAt: nextWeekly?.toISOString() ?? null,
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load progress" }, { status: 500 });
    }
}

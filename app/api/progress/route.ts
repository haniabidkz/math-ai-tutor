import { NextRequest, NextResponse } from "next/server";
import { getRuntimeConcepts } from "@/lib/assessment-content";
import { adminDb } from "@/lib/firebase-admin";
import { BADGES } from "@/lib/gamification";
import { homeworkStatus, isOverdue, sortHomework } from "@/lib/homework";
import { learningStatus, LEARNING_STATUS_LABELS, recommendNextLesson } from "@/lib/adaptive-recommendation";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
import type { StudentClassLevel } from "@/types/curriculum";
import type { StudentHomework } from "@/types/homework";

export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const studentRef = adminDb.collection("students").doc(user.uid);
        const [profileSnapshot, progressSnapshot, concepts, mistakeSnapshot, homeworkProgressSnapshot] = await Promise.all([
            studentRef.get(),
            studentRef.collection("conceptProgress").get(),
            getRuntimeConcepts(),
            studentRef.collection("mistakeProfile").where("possibleMisconception", "==", true).get(),
            studentRef.collection("homeworkProgress").get(),
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

        // Open misconceptions, weak diagnostic topics and the ordered path all feed the recommendation.
        const openMisconceptions = mistakeSnapshot.docs.map((doc) => ({
            microTag: String(doc.data().microTag ?? ""),
            misconceptionTag: String(doc.data().misconceptionTag ?? ""),
            count: Number(doc.data().count ?? 0),
        }));
        const recommendation = recommendNextLesson({
            concepts: conceptItems,
            diagnosticProfile: profile.diagnosticProfile ?? null,
            misconceptions: openMisconceptions,
        });
        const nextLesson = recommendation.concept;

        // Homework assigned to this student, either by class or by name.
        const [classWideHomework, namedHomework] = await Promise.all([
            adminDb.collection("homework").where("classLevel", "==", classLevel).where("allStudents", "==", true).get(),
            adminDb.collection("homework").where("studentUids", "array-contains", user.uid).get(),
        ]);
        const homeworkProgressById = new Map(homeworkProgressSnapshot.docs.map((doc) => [doc.id, doc.data()]));
        const homeworkDocs = new Map<string, FirebaseFirestore.DocumentData>();
        for (const doc of [...classWideHomework.docs, ...namedHomework.docs]) homeworkDocs.set(doc.id, doc.data());
        const homework = sortHomework([...homeworkDocs.entries()].map(([id, data]) => {
            const record = homeworkProgressById.get(id);
            const status = homeworkStatus(record);
            return {
                id,
                microTag: data.microTag,
                title: data.title,
                topicTitle: data.topicTitle,
                classLevel: data.classLevel,
                questionCount: data.questionCount,
                dueDate: data.dueDate,
                allStudents: data.allStudents === true,
                studentUids: Array.isArray(data.studentUids) ? data.studentUids : [],
                assignedByUid: data.assignedByUid,
                assignedByEmail: data.assignedByEmail,
                note: data.note,
                status,
                percentage: typeof record?.percentage === "number" ? record.percentage : null,
                completedAt: record?.completedAt?.toDate?.()?.toISOString() ?? null,
                overdue: isOverdue(data.dueDate, status),
            } satisfies StudentHomework;
        }));

        const earnedBadgeIds = new Set<string>(Array.isArray(profile.badgeIds) ? profile.badgeIds : []);
        const streak = {
            current: Number(profile.streak?.current ?? 0),
            longest: Number(profile.streak?.longest ?? 0),
            lastActivityDate: profile.streak?.lastActivityDate ?? null,
        };

        const masteredCount = conceptItems.filter((concept) => concept.mastered).length;
        const status = learningStatus({
            masteredCount,
            totalCount: conceptItems.length,
            openMisconceptions: openMisconceptions.length,
            quizzesCompleted: Number(profile.quizzesCompleted ?? 0),
            diagnosticOverallBand: profile.diagnosticProfile?.overallBand ?? null,
        });

        return NextResponse.json({
            success: true,
            profile: { name: profile.name, email: profile.email, classLevel, diagnosticCompleted: profile.diagnosticCompleted === true || profile.placementCompleted === true },
            gamification: {
                xp: Number(profile.xp ?? 0),
                streak,
                quizzesCompleted: Number(profile.quizzesCompleted ?? 0),
                lessonsCompleted: Number(profile.lessonsCompleted ?? 0),
                questionsAnswered: Number(profile.questionsAnswered ?? 0),
                badges: BADGES.map((badge) => ({
                    id: badge.id,
                    title: badge.title,
                    description: badge.description,
                    icon: badge.icon,
                    earned: earnedBadgeIds.has(badge.id),
                })),
            },
            nextLesson: nextLesson
                ? {
                    microTag: nextLesson.microTag,
                    title: nextLesson.title,
                    topicTitle: nextLesson.topicTitle,
                    percentage: nextLesson.percentage,
                    reason: recommendation.reason,
                }
                : null,
            homework,
            learningStatus: {
                key: status,
                label: LEARNING_STATUS_LABELS[status],
                openMisconceptions: openMisconceptions.length,
            },
            diagnostic: profile.diagnosticProfile
                ? {
                    topicResults: profile.diagnosticProfile.topicResults ?? [],
                    overallBand: profile.diagnosticProfile.overallBand ?? null,
                    overallCorrect: profile.diagnosticProfile.overallCorrect ?? null,
                    overallTotal: profile.diagnosticProfile.overallTotal ?? null,
                }
                : null,
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

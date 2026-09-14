import { getRuntimeConcepts } from "@/lib/assessment-content";
import { learningStatus, LEARNING_STATUS_LABELS, recommendNextLesson } from "@/lib/adaptive-recommendation";
import { getConcept } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { homeworkStatus, isOverdue, sortHomework } from "@/lib/homework";
import { buildConceptItems, selectActiveTopics, summarizeSessions, toMillis, type SessionLike } from "@/lib/learner-metrics";
import { MISCONCEPTIONS } from "@/lib/mistake-analysis";
import type { LocalizedText, MisconceptionTag } from "@/types/curriculum";

export interface ChildSummary {
    uid: string;
    name: string;
    email: string;
    classLevel: number;
    lastActiveAt: string | null;
    learningStatus: { key: string; label: LocalizedText };
    metrics: {
        conceptsMastered: number;
        conceptsTotal: number;
        overallPercent: number;
        quizzesCompleted: number;
        lessonsCompleted: number;
        questionsAnswered: number;
        correctAnswers: number;
        accuracyPercent: number | null;
        timeSpentSeconds: number;
        xp: number;
        streak: number;
    };
    activeTopics: Array<{ microTag: string; title: LocalizedText; topicTitle: LocalizedText; mastered: boolean; locked: boolean; percentage: number }>;
}

export interface ChildDetail extends ChildSummary {
    topics: Array<{ topicId: string; title: LocalizedText; mastered: number; total: number }>;
    recentQuizzes: Array<{ sessionId: string; topicName: string; percentage: number; score: number; maxScore: number; completedAt: string | null; timeSpentSeconds: number }>;
    misconceptions: Array<{ microTag: string; topic: string; label: string; count: number }>;
    homework: Array<{ id: string; title: string; dueDate: string; status: string; percentage: number | null; overdue: boolean }>;
}

const iso = (value: unknown) => {
    const millis = toMillis(value as never);
    return millis === null ? null : new Date(millis).toISOString();
};

/**
 * Everything a parent sees about one child, computed on the server from the child's own
 * records. Sessions are read without their question lists to keep this light.
 */
export async function buildChildReport(uid: string, detail: boolean): Promise<ChildSummary | ChildDetail | null> {
    const studentRef = adminDb.collection("students").doc(uid);
    const [studentSnapshot, progressSnapshot, sessionSnapshot, misconceptionSnapshot, concepts] = await Promise.all([
        studentRef.get(),
        studentRef.collection("conceptProgress").get(),
        studentRef.collection("assessmentSessions").select("kind", "status", "startedAt", "updatedAt", "completedAt", "answers").get(),
        studentRef.collection("mistakeProfile").where("possibleMisconception", "==", true).get(),
        getRuntimeConcepts(),
    ]);
    if (!studentSnapshot.exists) return null;

    const student = studentSnapshot.data() ?? {};
    const classLevel = Number(student.class);
    const progress = new Map(progressSnapshot.docs.map((doc) => [doc.id, doc.data()]));
    const strong = new Set<string>(student.diagnosticProfile?.strongMicroTags ?? []);
    const conceptItems = buildConceptItems(concepts, classLevel, progress, strong);
    const work = summarizeSessions(sessionSnapshot.docs.map((doc) => doc.data() as SessionLike));
    const openMisconceptions = misconceptionSnapshot.docs.map((doc) => doc.data());

    const recommendation = recommendNextLesson({
        concepts: conceptItems,
        diagnosticProfile: student.diagnosticProfile ?? null,
        misconceptions: openMisconceptions.map((item) => ({
            microTag: String(item.microTag ?? ""),
            misconceptionTag: String(item.misconceptionTag ?? ""),
            count: Number(item.count ?? 0),
        })),
    });
    const mastered = conceptItems.filter((concept) => concept.mastered).length;
    const quizzesCompleted = Math.max(Number(student.quizzesCompleted ?? 0), work.quizzesCompleted);
    const status = learningStatus({
        masteredCount: mastered,
        totalCount: conceptItems.length,
        openMisconceptions: openMisconceptions.length,
        quizzesCompleted,
        diagnosticOverallBand: student.diagnosticProfile?.overallBand ?? null,
    });

    const summary: ChildSummary = {
        uid,
        name: String(student.name ?? "Student"),
        email: String(student.email ?? ""),
        classLevel,
        lastActiveAt: iso(student.updatedAt),
        learningStatus: { key: status, label: LEARNING_STATUS_LABELS[status] },
        metrics: {
            conceptsMastered: mastered,
            conceptsTotal: conceptItems.length,
            overallPercent: conceptItems.length ? Math.round((mastered / conceptItems.length) * 100) : 0,
            quizzesCompleted,
            lessonsCompleted: Number(student.lessonsCompleted ?? 0),
            questionsAnswered: work.answered,
            correctAnswers: work.correct,
            accuracyPercent: work.accuracyPercent,
            timeSpentSeconds: work.timeSpentSeconds,
            xp: Number(student.xp ?? 0),
            streak: Number(student.streak?.current ?? 0),
        },
        activeTopics: selectActiveTopics(conceptItems, recommendation.concept?.microTag).map((concept) => ({
            microTag: concept.microTag,
            title: concept.title,
            topicTitle: concept.topicTitle,
            mastered: concept.mastered,
            locked: concept.locked,
            percentage: concept.percentage,
        })),
    };
    if (!detail) return summary;

    const [quizSnapshot, homeworkProgressSnapshot, classWideHomework, namedHomework] = await Promise.all([
        studentRef.collection("quizResults").orderBy("completedAt", "desc").limit(10).get(),
        studentRef.collection("homeworkProgress").get(),
        adminDb.collection("homework").where("classLevel", "==", classLevel).where("allStudents", "==", true).get(),
        adminDb.collection("homework").where("studentUids", "array-contains", uid).get(),
    ]);

    const topicIds = [...new Set(conceptItems.map((concept) => concept.topicId))];
    const homeworkProgress = new Map(homeworkProgressSnapshot.docs.map((doc) => [doc.id, doc.data()]));
    const homeworkDocs = new Map<string, FirebaseFirestore.DocumentData>();
    for (const doc of [...classWideHomework.docs, ...namedHomework.docs]) homeworkDocs.set(doc.id, doc.data());

    return {
        ...summary,
        topics: topicIds.map((topicId) => {
            const inTopic = conceptItems.filter((concept) => concept.topicId === topicId);
            return {
                topicId,
                title: inTopic[0].topicTitle,
                mastered: inTopic.filter((concept) => concept.mastered).length,
                total: inTopic.length,
            };
        }),
        recentQuizzes: quizSnapshot.docs.map((doc) => {
            const data = doc.data();
            const microTag = typeof data.microTag === "string" ? data.microTag : data.topicName;
            return {
                sessionId: doc.id,
                // Older results stored the raw tag as the name; show the concept title instead.
                topicName: getConcept(String(microTag))?.title.english ?? String(data.topicName ?? "Quiz"),
                percentage: Number(data.percentage ?? 0),
                score: Number(data.score ?? 0),
                maxScore: Number(data.maxScore ?? 0),
                completedAt: iso(data.completedAt),
                timeSpentSeconds: Number(data.totalTimeSeconds ?? 0),
            };
        }),
        misconceptions: openMisconceptions.map((item) => ({
            microTag: String(item.microTag ?? ""),
            topic: getConcept(String(item.microTag ?? ""))?.title.english ?? String(item.microTag ?? ""),
            label: MISCONCEPTIONS[item.misconceptionTag as MisconceptionTag]?.label.english ?? String(item.misconceptionTag ?? ""),
            count: Number(item.count ?? 0),
        })),
        homework: sortHomework([...homeworkDocs.entries()].map(([id, data]) => {
            const record = homeworkProgress.get(id);
            const state = homeworkStatus(record);
            return {
                id,
                title: String(data.title?.english ?? data.microTag),
                dueDate: String(data.dueDate),
                status: state,
                percentage: typeof record?.percentage === "number" ? record.percentage : null,
                overdue: isOverdue(String(data.dueDate), state),
            };
        })),
    };
}

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
    getAssessmentConfig,
    getPublishedConcept,
    selectQuestion,
    selectQuizQuestions,
    toClientQuestion,
} from "@/lib/assessment-content";
import type { StoredQuizSession } from "@/lib/assessment-session";
import { getClassConcepts, getConcept, isLearningConceptForClass } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { buildQuestionHistory, type HistoricalQuestionSession } from "@/lib/question-history";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
import type { Difficulty, Locale, QuestionBankItem, StudentClassLevel } from "@/types/curriculum";

function parseLocale(value: unknown): Locale {
    return value === "roman-urdu" ? "roman-urdu" : "english";
}

function parseClass(value: unknown): StudentClassLevel | null {
    const parsed = Number(value);
    return parsed === 6 || parsed === 7 || parsed === 8 ? parsed : null;
}

async function weeklyQuestions(
    classLevel: StudentClassLevel,
    weakTags: string[],
    count: number,
    excludedIds: string[],
    previousAttemptIds: string[],
) {
    const classTags = getClassConcepts(classLevel).map((concept) => concept.microTag);
    const eligibleTags = new Set(classTags);
    const tags = [...weakTags.filter((microTag) => eligibleTags.has(microTag)), ...classTags];
    const uniqueTags = [...new Set(tags)];
    const selected: QuestionBankItem[] = [];
    for (let index = 0; selected.length < count && uniqueTags.length; index += 1) {
        const microTag = uniqueTags[index % uniqueTags.length];
        const selectedIds = selected.map((item) => item.id);
        const question = await selectQuestion({
            microTag,
            usedIds: [...excludedIds, ...selectedIds],
            previousAttemptIds: [...previousAttemptIds, ...selectedIds],
        });
        if (!selected.some((item) => item.id === question.id)) selected.push(question);
        if (index > count * uniqueTags.length) break;
    }
    return selected;
}

async function questionHistory(
    studentUid: string,
    kind: "mastery" | "weekly",
    microTag: string,
) {
    const snapshot = await adminDb.collection("students").doc(studentUid).collection("assessmentSessions").get();
    return buildQuestionHistory(
        snapshot.docs.map((document) => document.data() as HistoricalQuestionSession),
        (session) => session.kind === kind && session.microTag === microTag,
    );
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const body = await request.json();
        const profileSnapshot = await adminDb.collection("students").doc(user.uid).get();
        const profile = profileSnapshot.data() ?? {};
        const classLevel = parseClass(profile.class);
        if (!classLevel) return NextResponse.json({ success: false, error: "Student profile class must be 6, 7, or 8" }, { status: 409 });

        // Homework fixes the concept and the question count for this session.
        const homeworkId = typeof body.homeworkId === "string" && body.homeworkId ? body.homeworkId : null;
        let homework: FirebaseFirestore.DocumentData | null = null;
        if (homeworkId) {
            const snapshot = await adminDb.collection("homework").doc(homeworkId).get();
            if (!snapshot.exists) return NextResponse.json({ success: false, error: "Homework not found" }, { status: 404 });
            homework = snapshot.data() ?? null;
            const assignedToClass = homework?.allStudents === true && Number(homework?.classLevel) === classLevel;
            const assignedByName = Array.isArray(homework?.studentUids) && homework.studentUids.includes(user.uid);
            if (!assignedToClass && !assignedByName) {
                return NextResponse.json({ success: false, error: "This homework is not assigned to you" }, { status: 403 });
            }
        }

        const kind: "mastery" | "weekly" = homeworkId ? "mastery" : body.kind === "weekly" ? "weekly" : "mastery";
        const locale = parseLocale(body.locale);
        const preferredDifficulty: Difficulty = body.difficulty === "easy" || body.difficulty === "hard" ? body.difficulty : "medium";
        const config = await getAssessmentConfig();
        let microTag = String(homework?.microTag ?? body.microTag ?? body.topicId ?? "");
        if (!microTag && kind === "mastery") return NextResponse.json({ success: false, error: "microTag is required" }, { status: 400 });
        if (microTag && !getConcept(microTag)) {
            const byTopic = getClassConcepts(classLevel).find((concept) => concept.topicId === microTag);
            microTag = byTopic?.microTag ?? microTag;
        }
        if (kind === "mastery") {
            const concept = await getPublishedConcept(microTag);
            if (!concept) return NextResponse.json({ success: false, error: "Concept not found" }, { status: 404 });
            if (!isLearningConceptForClass(concept, classLevel)) {
                return NextResponse.json({ success: false, error: `This concept is not available for Class ${classLevel}` }, { status: 400 });
            }
        }

        const history = await questionHistory(user.uid, kind, kind === "weekly" ? "weekly-review" : microTag);
        const questions = kind === "weekly"
            ? await weeklyQuestions(
                classLevel,
                profile.diagnosticProfile?.weakMicroTags ?? [],
                config.weeklyQuestionCount,
                history.seenIds,
                history.previousAttemptIds,
            )
            : await selectQuizQuestions(
                microTag,
                Number(homework?.questionCount ?? config.masteryQuestionCount),
                preferredDifficulty,
                history.seenIds,
                history.previousAttemptIds,
            );
        if (!questions.length) return NextResponse.json({ success: false, error: "No published questions are available" }, { status: 409 });
        if (kind === "weekly") microTag = "weekly-review";

        const sessionId = `${kind}_${randomUUID()}`;
        const session: StoredQuizSession = {
            id: sessionId,
            kind,
            studentUid: user.uid,
            microTag,
            classLevel,
            locale,
            status: "active",
            questions,
            currentQuestionIndex: 0,
            score: 0,
            maxScore: questions.length,
            hintedQuestionIds: [],
            eventIds: [],
            answers: [],
            retryOf: typeof body.retryOf === "string" ? body.retryOf : null,
            remedialTag: null,
            homeworkId,
        };
        await adminDb.collection("students").doc(user.uid).collection("assessmentSessions").doc(sessionId).set({
            ...session,
            startedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        if (homeworkId) {
            await adminDb.collection("students").doc(user.uid).collection("homeworkProgress").doc(homeworkId).set({
                homeworkId,
                microTag,
                sessionId,
                startedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        return NextResponse.json({
            success: true,
            session: {
                id: sessionId,
                kind,
                homeworkId,
                microTag,
                question: toClientQuestion(questions[0], locale),
                // The whole set is sent so the student can keep answering without a network.
                questions: questions.map((item) => toClientQuestion(item, locale)),
                questionNumber: 1,
                totalQuestions: questions.length,
                score: 0,
            },
        }, { status: 201 });
    } catch (error) {
        console.error("Quiz start error", error);
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to create quiz" }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const sessionId = request.nextUrl.searchParams.get("sessionId");
        if (!sessionId) return NextResponse.json({ success: false, error: "sessionId is required" }, { status: 400 });
        const snapshot = await adminDb.collection("students").doc(user.uid).collection("assessmentSessions").doc(sessionId).get();
        if (!snapshot.exists) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
        const session = snapshot.data() as StoredQuizSession;
        return NextResponse.json({
            success: true,
            session: {
                id: session.id,
                kind: session.kind,
                microTag: session.microTag,
                status: session.status,
                score: session.score,
                maxScore: session.maxScore,
                questionNumber: Math.min(session.currentQuestionIndex + 1, session.questions.length),
                totalQuestions: session.questions.length,
                question: session.status === "active" ? toClientQuestion(session.questions[session.currentQuestionIndex], session.locale) : undefined,
                remedialTag: session.remedialTag,
            },
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load quiz" }, { status: 500 });
    }
}

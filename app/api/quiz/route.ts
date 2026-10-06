import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
    getAssessmentConfig,
    getPublishedConcept,
    getPublishedQuestions,
    getRuntimeConcepts,
    selectQuestion,
    selectQuizQuestions,
    toClientQuestion,
} from "@/lib/assessment-content";
import { chooseQuizDifficulty } from "@/lib/adaptive-engine";
import { currentQuizQuestion, type StoredQuizSession } from "@/lib/assessment-session";
import { findPreviousClassTopic, foundationProgress, type FoundationSource } from "@/lib/foundation-fallback";
import { getClassConcepts, getConcept, isLearningConceptForClass } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { buildQuestionHistory, type HistoricalQuestionSession } from "@/lib/question-history";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
import type { Difficulty, Locale, QuestionBankItem, StudentClassLevel } from "@/types/curriculum";

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
    // Lessons stored in the database, including micro-topics created in AI Studio, all take part.
    const classTags = (await getRuntimeConcepts())
        .filter((concept) => isLearningConceptForClass(concept, classLevel))
        .sort((left, right) => left.topicId.localeCompare(right.topicId) || left.order - right.order)
        .map((concept) => concept.microTag);
    const eligibleTags = new Set(classTags);
    const tags = [...weakTags.filter((microTag) => eligibleTags.has(microTag)), ...classTags];
    // Lessons whose practice questions have not been written yet are skipped.
    const pools = await Promise.all([...new Set(tags)].map(async (microTag) => ({ microTag, size: (await getPublishedQuestions(microTag)).length })));
    const uniqueTags = pools.filter((pool) => pool.size > 0).map((pool) => pool.microTag);
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
        // Questions are always English; Roman Urdu is offered per hint and explanation.
        const locale: Locale = "english";
        const config = await getAssessmentConfig();
        let microTag = String(homework?.microTag ?? body.microTag ?? body.topicId ?? "");
        if (!microTag && kind === "mastery") return NextResponse.json({ success: false, error: "microTag is required" }, { status: 400 });
        if (microTag && !getConcept(microTag)) {
            const byTopic = getClassConcepts(classLevel).find((concept) => concept.topicId === microTag);
            microTag = byTopic?.microTag ?? microTag;
        }
        let topicTitle: string | undefined;
        let foundationSource: FoundationSource | null = null;
        if (kind === "mastery") {
            const concept = await getPublishedConcept(microTag);
            if (!concept) return NextResponse.json({ success: false, error: "Concept not found" }, { status: 404 });
            if (!isLearningConceptForClass(concept, classLevel)) {
                return NextResponse.json({ success: false, error: `This concept is not available for Class ${classLevel}` }, { status: 400 });
            }
            topicTitle = concept.title.english;
            // The same topic one class down, ready in case the student struggles with this one.
            foundationSource = findPreviousClassTopic(concept, await getRuntimeConcepts());
        }

        // Students do not pick a level: it follows the diagnostic and their last result here.
        const conceptProgress = kind === "mastery"
            ? (await adminDb.collection("students").doc(user.uid).collection("conceptProgress").doc(microTag).get()).data()
            : undefined;
        // A lesson the student already fell short on opens the previous-class round after one miss.
        const struggledBefore = kind === "mastery" && typeof conceptProgress?.percentage === "number" && conceptProgress.percentage < config.masteryThresholdPercent;
        const preferredDifficulty: Difficulty = chooseQuizDifficulty({
            baseline: profile.diagnosticProfile?.baselineDifficulty ?? null,
            adaptiveLevel: typeof profile.adaptive_level === "number" ? profile.adaptive_level : null,
            conceptPercentage: typeof conceptProgress?.percentage === "number" ? conceptProgress.percentage : null,
        });

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
        if (!questions.length) {
            return NextResponse.json({
                success: false,
                code: "no_questions",
                error: "Practice questions for this lesson are being prepared. Please try another lesson, or check back soon.",
            }, { status: 409 });
        }
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
            ...(topicTitle ? { topicTitle } : {}),
            foundationSource,
            struggledBefore,
            foundation: null,
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
                classLevel,
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
        const current = currentQuizQuestion(session);
        return NextResponse.json({
            success: true,
            session: {
                id: session.id,
                kind: session.kind,
                microTag: session.microTag,
                classLevel: session.classLevel,
                status: session.status,
                score: session.score,
                maxScore: session.maxScore,
                questionNumber: Math.min(session.currentQuestionIndex + 1, session.questions.length),
                totalQuestions: session.questions.length,
                question: current ? toClientQuestion(current, "english") : undefined,
                remedialTag: session.remedialTag,
                foundation: session.status === "foundation_practice" && session.foundationSource && session.foundation
                    ? foundationProgress(session.foundationSource, session.foundation)
                    : undefined,
            },
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load quiz" }, { status: 500 });
    }
}

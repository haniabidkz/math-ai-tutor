import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { addDays, isMastered, masteryPercentage, scoreDelta } from "@/lib/adaptive-engine";
import { getAssessmentConfig, getPublishedConcept, localized, toClientQuestion } from "@/lib/assessment-content";
import type { StoredAnswer, StoredQuizSession } from "@/lib/assessment-session";
import { adminDb } from "@/lib/firebase-admin";
import { authErrorResponse, requireVerifiedUser } from "@/lib/server-auth";

type EvaluationOutcome = {
    success: true;
    duplicate?: boolean;
    action: "hint" | "answer" | "remedialComplete";
    isCorrect?: boolean;
    hint?: string;
    explanation?: string;
    score: number;
    scoreDelta: number;
    status: StoredQuizSession["status"];
    completed: boolean;
    mastered?: boolean;
    percentage?: number;
    question?: ReturnType<typeof toClientQuestion>;
    questionNumber?: number;
    totalQuestions: number;
    remedial?: {
        microTag: string;
        title: string;
        concept: string;
        visualKind: string;
        imageUrl?: string;
    };
};

function currentResponse(session: StoredQuizSession, duplicate = false): EvaluationOutcome {
    return {
        success: true,
        duplicate,
        action: "answer",
        score: session.score,
        scoreDelta: 0,
        status: session.status,
        completed: session.status === "completed",
        question: session.status === "active" ? toClientQuestion(session.questions[session.currentQuestionIndex], session.locale) : undefined,
        questionNumber: Math.min(session.currentQuestionIndex + 1, session.questions.length),
        totalQuestions: session.questions.length,
    };
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireVerifiedUser(request, ["student"]);
        const body = await request.json();
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        const eventId = typeof body.eventId === "string" ? body.eventId : "";
        const action = body.action === "hint" || body.action === "remedialComplete" ? body.action : "answer";
        if (!sessionId || !eventId) return NextResponse.json({ success: false, error: "sessionId and eventId are required" }, { status: 400 });

        const sessionRef = adminDb.collection("students").doc(user.uid).collection("assessmentSessions").doc(sessionId);
        const initialSnapshot = await sessionRef.get();
        if (!initialSnapshot.exists) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
        const initial = initialSnapshot.data() as StoredQuizSession;
        if (initial.kind !== "mastery" && initial.kind !== "weekly") {
            return NextResponse.json({ success: false, error: "This endpoint only evaluates mastery and weekly sessions" }, { status: 400 });
        }
        if (initial.eventIds?.includes(eventId)) return NextResponse.json(currentResponse(initial, true));

        const currentQuestion = initial.questions[initial.currentQuestionIndex];
        if (action !== "remedialComplete" && (!currentQuestion || body.questionId !== currentQuestion.id)) {
            return NextResponse.json({ success: false, error: "Question is no longer current" }, { status: 409 });
        }
        if (action === "answer" && !["A", "B", "C", "D"].includes(body.optionId)) {
            return NextResponse.json({ success: false, error: "Select one answer option" }, { status: 400 });
        }

        const remedialTag = currentQuestion?.prerequisiteTag ?? currentQuestion?.microTag ?? initial.remedialTag;
        const remedialConcept = remedialTag ? await getPublishedConcept(remedialTag) : undefined;
        const config = await getAssessmentConfig();
        let outcome: EvaluationOutcome = currentResponse(initial);

        await adminDb.runTransaction(async (transaction) => {
            const snapshot = await transaction.get(sessionRef);
            const session = snapshot.data() as StoredQuizSession | undefined;
            if (!session) throw new Error("SESSION_NOT_FOUND");
            if (session.eventIds?.includes(eventId)) {
                outcome = currentResponse(session, true);
                return;
            }
            if (session.status === "completed") {
                outcome = currentResponse(session);
                return;
            }

            const question = session.questions[session.currentQuestionIndex];
            const eventIds = [...(session.eventIds ?? []), eventId];
            if (action === "hint") {
                if (session.status !== "active") throw new Error("REMEDIATION_REQUIRED");
                const alreadyUsed = session.hintedQuestionIds?.includes(question.id) ?? false;
                const delta = scoreDelta("hint", alreadyUsed);
                const score = session.score + delta;
                transaction.update(sessionRef, {
                    eventIds,
                    score,
                    hintedQuestionIds: alreadyUsed ? session.hintedQuestionIds : [...session.hintedQuestionIds, question.id],
                    updatedAt: FieldValue.serverTimestamp(),
                });
                outcome = {
                    success: true,
                    action,
                    hint: localized(question.hint, session.locale),
                    score,
                    scoreDelta: delta,
                    status: session.status,
                    completed: false,
                    question: toClientQuestion(question, session.locale),
                    questionNumber: session.currentQuestionIndex + 1,
                    totalQuestions: session.questions.length,
                };
                return;
            }

            if (action === "remedialComplete") {
                if (session.status !== "remedial_required") throw new Error("NO_REMEDIATION_PENDING");
                const nextIndex = session.currentQuestionIndex + 1;
                const completed = nextIndex >= session.questions.length;
                transaction.update(sessionRef, {
                    eventIds,
                    currentQuestionIndex: completed ? session.currentQuestionIndex : nextIndex,
                    status: completed ? "completed" : "active",
                    remedialTag: null,
                    ...(completed ? { completedAt: FieldValue.serverTimestamp() } : {}),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                outcome = await completeOrContinue(transaction, sessionRef, { ...session, eventIds, currentQuestionIndex: completed ? session.currentQuestionIndex : nextIndex, status: completed ? "completed" : "active", remedialTag: null }, user.uid, config, 0, action);
                return;
            }

            if (session.status !== "active") throw new Error("REMEDIATION_REQUIRED");
            if (question.id !== body.questionId) throw new Error("STALE_QUESTION");
            const correct = body.optionId === question.correctOptionId;
            const delta = scoreDelta(correct ? "correct" : "incorrect");
            const score = session.score + delta;
            const answer: StoredAnswer = {
                eventId,
                questionId: question.id,
                microTag: question.microTag,
                difficulty: question.difficulty,
                optionId: body.optionId,
                isCorrect: correct,
                scoreDelta: delta,
                answeredAt: new Date(),
            };
            const answers = [...(session.answers ?? []), answer];

            if (!correct) {
                transaction.update(sessionRef, {
                    eventIds,
                    answers,
                    score,
                    status: "remedial_required",
                    remedialTag,
                    updatedAt: FieldValue.serverTimestamp(),
                });
                outcome = {
                    success: true,
                    action,
                    isCorrect: false,
                    explanation: localized(question.explanation, session.locale),
                    score,
                    scoreDelta: delta,
                    status: "remedial_required",
                    completed: false,
                    totalQuestions: session.questions.length,
                    questionNumber: session.currentQuestionIndex + 1,
                    remedial: remedialConcept ? {
                        microTag: remedialConcept.microTag,
                        title: localized(remedialConcept.title, session.locale),
                        concept: localized(remedialConcept.concept, session.locale),
                        visualKind: remedialConcept.visualKind,
                        imageUrl: remedialConcept.imageUrl,
                    } : undefined,
                };
                return;
            }

            const nextIndex = session.currentQuestionIndex + 1;
            const completed = nextIndex >= session.questions.length;
            const updated: StoredQuizSession = {
                ...session,
                eventIds,
                answers,
                score,
                currentQuestionIndex: completed ? session.currentQuestionIndex : nextIndex,
                status: completed ? "completed" : "active",
            };
            transaction.update(sessionRef, {
                eventIds,
                answers,
                score,
                currentQuestionIndex: updated.currentQuestionIndex,
                status: updated.status,
                ...(completed ? { completedAt: FieldValue.serverTimestamp() } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            });
            outcome = await completeOrContinue(transaction, sessionRef, updated, user.uid, config, delta, action, true, localized(question.explanation, session.locale));
        });

        return NextResponse.json(outcome);
    } catch (error) {
        console.error("Quiz evaluation error", error);
        const auth = authErrorResponse(error);
        const message = error instanceof Error ? error.message : "";
        const conflict = ["REMEDIATION_REQUIRED", "NO_REMEDIATION_PENDING", "STALE_QUESTION"].includes(message);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: conflict ? "Complete the current remediation step first" : "Failed to evaluate answer" }, { status: conflict ? 409 : 500 });
    }
}

async function completeOrContinue(
    transaction: FirebaseFirestore.Transaction,
    _sessionRef: FirebaseFirestore.DocumentReference,
    session: StoredQuizSession,
    uid: string,
    config: Awaited<ReturnType<typeof getAssessmentConfig>>,
    delta: number,
    action: "answer" | "remedialComplete",
    isCorrect?: boolean,
    explanation?: string,
): Promise<EvaluationOutcome> {
    if (session.status !== "completed") {
        return {
            success: true,
            action,
            isCorrect,
            explanation,
            score: session.score,
            scoreDelta: delta,
            status: session.status,
            completed: false,
            question: toClientQuestion(session.questions[session.currentQuestionIndex], session.locale),
            questionNumber: session.currentQuestionIndex + 1,
            totalQuestions: session.questions.length,
        };
    }

    const percentage = Math.round(masteryPercentage(session.score, session.maxScore));
    const mastered = isMastered(session.score, session.maxScore, config.masteryThresholdPercent);
    const studentRef = adminDb.collection("students").doc(uid);
    const understandingLevel = percentage >= 85 ? "EXCELLENT" : percentage >= 70 ? "GOOD" : percentage >= 50 ? "AVERAGE" : "WEAK";
    transaction.set(studentRef.collection("quizResults").doc(session.id), {
        sessionId: session.id,
        topicName: session.kind === "weekly" ? "Weekly Review" : session.microTag,
        score: session.score,
        maxScore: session.maxScore,
        percentage,
        totalHintsUsed: session.hintedQuestionIds.length,
        totalTimeSeconds: 0,
        understandingLevel,
        feedback: mastered ? "Mastery threshold reached." : "Review the prerequisite and try a fresh session.",
        completedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (session.kind === "weekly") {
        transaction.set(studentRef, {
            lastWeeklyAssessmentAt: FieldValue.serverTimestamp(),
            nextWeeklyAssessmentAt: addDays(new Date(), config.weeklyIntervalDays),
            weeklyScorePercent: percentage,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    } else {
        transaction.set(studentRef.collection("conceptProgress").doc(session.microTag), {
            microTag: session.microTag,
            score: session.score,
            maxScore: session.maxScore,
            percentage,
            mastered,
            lastSessionId: session.id,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(studentRef.collection("topicProgress").doc(session.microTag), {
            topicId: session.microTag,
            topicName: session.microTag,
            classLevel: session.classLevel,
            understood: mastered,
            understandingLevel,
            completedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    }

    return {
        success: true,
        action,
        isCorrect,
        explanation,
        score: session.score,
        scoreDelta: delta,
        status: "completed",
        completed: true,
        mastered,
        percentage,
        totalQuestions: session.questions.length,
    };
}

import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { addDays, isMastered, masteryPercentage, scoreDelta } from "@/lib/adaptive-engine";
import {
    getAssessmentConfig,
    getPublishedConcept,
    localized,
    selectQuizQuestions,
    toClientQuestion,
} from "@/lib/assessment-content";
import { sessionXp, type StoredAnswer, type StoredQuizSession } from "@/lib/assessment-session";
import { adminDb } from "@/lib/firebase-admin";
import {
    activityDateKey,
    BADGE_BY_ID,
    newlyEarnedBadges,
    nextStreak,
    type StreakState,
} from "@/lib/gamification";
import {
    getOptionAnalysis,
    isPossibleMisconception,
    mistakeProfileId,
    MISTAKE_TYPE_GUIDANCE,
    MISTAKE_TYPE_LABELS,
} from "@/lib/mistake-analysis";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
import type { Locale, MistakeType, QuestionBankItem } from "@/types/curriculum";

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
    /** Mistake analysis for the option the student just chose. */
    mistake?: { type: MistakeType; label: string; explanation: string };
    /** Present once the same mistake type repeats often enough on one concept. */
    misconception?: { microTag: string; type: MistakeType; label: string; guidance: string; practiceTotal: number };
    /** Progress through the targeted practice queue that follows a misconception. */
    practice?: { number: number; total: number; isRecheck: boolean };
    xpEarned?: number;
    totalXp?: number;
    streak?: number;
    newBadges?: Array<{ id: string; title: string; description: string; icon: string }>;
};

function currentResponse(session: StoredQuizSession, duplicate = false): EvaluationOutcome {
    const question = activeQuestion(session);
    return {
        success: true,
        duplicate,
        action: "answer",
        score: session.score,
        scoreDelta: 0,
        status: session.status,
        completed: session.status === "completed",
        question: question ? toClientQuestion(question, session.locale) : undefined,
        questionNumber: Math.min(session.currentQuestionIndex + 1, session.questions.length),
        totalQuestions: session.questions.length,
    };
}

/** The question the student is answering right now, from the main list or the practice queue. */
function activeQuestion(session: StoredQuizSession): QuestionBankItem | undefined {
    if (session.status === "misconception_practice") {
        return session.practiceQueue?.[session.practiceIndex ?? 0];
    }
    if (session.status !== "active") return undefined;
    return session.questions[session.currentQuestionIndex];
}

function practiceProgress(session: StoredQuizSession, index: number): EvaluationOutcome["practice"] {
    const total = session.practiceQueue?.length ?? 0;
    return { number: index + 1, total, isRecheck: index === total - 1 };
}

function localizedMistake(type: MistakeType, explanation: string, locale: Locale) {
    return { type, label: localized(MISTAKE_TYPE_LABELS[type], locale), explanation };
}

/** Two targeted practice questions plus a final re-check, drawn from the same concept. */
async function buildPracticeQueue(microTag: string, practiceCount: number, excludeIds: string[]) {
    const wanted = Math.max(1, practiceCount) + 1;
    const questions = await selectQuizQuestions(microTag, wanted, "easy", excludeIds, excludeIds);
    return questions.slice(0, wanted);
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const body = await request.json();
        const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
        const eventId = typeof body.eventId === "string" ? body.eventId : "";
        const action = body.action === "hint" || body.action === "remedialComplete" ? body.action : "answer";
        if (!sessionId || !eventId) return NextResponse.json({ success: false, error: "sessionId and eventId are required" }, { status: 400 });

        const studentRef = adminDb.collection("students").doc(user.uid);
        const sessionRef = studentRef.collection("assessmentSessions").doc(sessionId);
        const initialSnapshot = await sessionRef.get();
        if (!initialSnapshot.exists) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
        const initial = initialSnapshot.data() as StoredQuizSession;
        if (initial.kind !== "mastery" && initial.kind !== "weekly") {
            return NextResponse.json({ success: false, error: "This endpoint only evaluates mastery and weekly sessions" }, { status: 400 });
        }
        if (initial.eventIds?.includes(eventId)) return NextResponse.json(currentResponse(initial, true));

        const initialQuestion = activeQuestion(initial);
        if (action !== "remedialComplete" && (!initialQuestion || body.questionId !== initialQuestion.id)) {
            return NextResponse.json({ success: false, error: "Question is no longer current" }, { status: 409 });
        }
        if (action === "answer" && !["A", "B", "C", "D"].includes(body.optionId)) {
            return NextResponse.json({ success: false, error: "Select one answer option" }, { status: 400 });
        }

        const mainQuestion = initial.questions[initial.currentQuestionIndex];
        const remedialTag = mainQuestion?.prerequisiteTag ?? mainQuestion?.microTag ?? initial.remedialTag;
        const remedialConcept = remedialTag ? await getPublishedConcept(remedialTag) : undefined;
        const config = await getAssessmentConfig();

        // A wrong answer on a main question may open a practice queue, so prepare one up front:
        // Firestore transactions cannot run queries, and this keeps the write path deterministic.
        const wrongOnMain = action === "answer"
            && initial.status === "active"
            && initialQuestion
            && body.optionId !== initialQuestion.correctOptionId;
        const pendingAnalysis = wrongOnMain && initialQuestion
            ? getOptionAnalysis(initialQuestion, body.optionId)
            : null;
        // Exclude the main questions and anything already answered, so a repeated
        // misconception gets fresh practice rather than the same pair again.
        const practiceQueue = wrongOnMain && initialQuestion
            ? await buildPracticeQueue(
                initialQuestion.microTag,
                config.misconceptionPracticeCount,
                [
                    ...initial.questions.map((item) => item.id),
                    ...(initial.answers ?? []).map((item) => item.questionId),
                ],
            )
            : [];

        let outcome: EvaluationOutcome = currentResponse(initial);

        await adminDb.runTransaction(async (transaction) => {
            // Firestore requires every read before the first write, so the session and the
            // reward state are both loaded up front even when only one of them is needed.
            const snapshot = await transaction.get(sessionRef);
            const student = (await transaction.get(studentRef)).data() ?? {};
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

            const question = activeQuestion(session);
            const eventIds = [...(session.eventIds ?? []), eventId];

            if (action === "hint") {
                if (session.status !== "active" && session.status !== "misconception_practice") throw new Error("REMEDIATION_REQUIRED");
                if (!question) throw new Error("STALE_QUESTION");
                const alreadyUsed = session.hintedQuestionIds?.includes(question.id) ?? false;
                const delta = session.status === "active" ? scoreDelta("hint", alreadyUsed) : 0;
                const score = session.score + delta;
                transaction.update(sessionRef, {
                    eventIds,
                    score,
                    hintedQuestionIds: alreadyUsed ? session.hintedQuestionIds : [...(session.hintedQuestionIds ?? []), question.id],
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
                    practice: session.status === "misconception_practice" ? practiceProgress(session, session.practiceIndex ?? 0) : undefined,
                };
                return;
            }

            if (action === "remedialComplete") {
                if (session.status !== "remedial_required") throw new Error("NO_REMEDIATION_PENDING");

                // A detected misconception diverts into targeted practice before the quiz resumes.
                const queue = session.practiceQueue ?? [];
                if (session.misconception && queue.length) {
                    transaction.update(sessionRef, {
                        eventIds,
                        status: "misconception_practice",
                        practiceIndex: 0,
                        remedialTag: null,
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    outcome = {
                        success: true,
                        action,
                        score: session.score,
                        scoreDelta: 0,
                        status: "misconception_practice",
                        completed: false,
                        question: toClientQuestion(queue[0], session.locale),
                        questionNumber: session.currentQuestionIndex + 1,
                        totalQuestions: session.questions.length,
                        practice: practiceProgress({ ...session, practiceQueue: queue }, 0),
                    };
                    return;
                }

                const nextIndex = session.currentQuestionIndex + 1;
                const completed = nextIndex >= session.questions.length;
                transaction.update(sessionRef, {
                    eventIds,
                    currentQuestionIndex: completed ? session.currentQuestionIndex : nextIndex,
                    status: completed ? "completed" : "active",
                    remedialTag: null,
                    misconception: null,
                    practiceQueue: [],
                    practiceIndex: 0,
                    ...(completed ? { completedAt: FieldValue.serverTimestamp() } : {}),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                outcome = completeOrContinue(
                    transaction,
                    { ...session, eventIds, currentQuestionIndex: completed ? session.currentQuestionIndex : nextIndex, status: completed ? "completed" : "active", remedialTag: null },
                    user.uid,
                    student,
                    config,
                    0,
                    action,
                );
                return;
            }

            if (!question) throw new Error("STALE_QUESTION");
            if (question.id !== body.questionId) throw new Error("STALE_QUESTION");
            const correct = body.optionId === question.correctOptionId;
            const hintUsed = session.hintedQuestionIds?.includes(question.id) ?? false;

            // ---- Answer inside the misconception practice queue -------------------------
            if (session.status === "misconception_practice") {
                const queue = session.practiceQueue ?? [];
                const index = session.practiceIndex ?? 0;
                const isRecheck = index === queue.length - 1;
                const answers = [...(session.answers ?? []), {
                    eventId,
                    questionId: question.id,
                    microTag: question.microTag,
                    difficulty: question.difficulty,
                    optionId: body.optionId,
                    isCorrect: correct,
                    scoreDelta: 0,
                    answeredAt: new Date(),
                    hintUsed,
                    practice: true,
                    mistakeType: correct ? null : getOptionAnalysis(question, body.optionId)?.mistakeType ?? null,
                } satisfies StoredAnswer];

                const analysis = correct ? null : getOptionAnalysis(question, body.optionId);
                const finished = index + 1 >= queue.length;

                if (!finished) {
                    transaction.update(sessionRef, {
                        eventIds,
                        answers,
                        practiceIndex: index + 1,
                        updatedAt: FieldValue.serverTimestamp(),
                    });
                    outcome = {
                        success: true,
                        action,
                        isCorrect: correct,
                        explanation: localized(question.explanation, session.locale),
                        score: session.score,
                        scoreDelta: 0,
                        status: "misconception_practice",
                        completed: false,
                        question: toClientQuestion(queue[index + 1], session.locale),
                        questionNumber: session.currentQuestionIndex + 1,
                        totalQuestions: session.questions.length,
                        practice: practiceProgress(session, index + 1),
                        mistake: analysis ? localizedMistake(analysis.mistakeType, localized(analysis.explanation, session.locale), session.locale) : undefined,
                    };
                    return;
                }

                // Queue finished: clear the misconception and resume the main quiz.
                if (isRecheck && correct && session.misconception) {
                    transaction.set(
                        studentRef.collection("mistakeProfile").doc(mistakeProfileId(session.misconception.microTag, session.misconception.mistakeType)),
                        { possibleMisconception: false, resolvedAt: FieldValue.serverTimestamp(), count: 0 },
                        { merge: true },
                    );
                }
                const nextIndex = session.currentQuestionIndex + 1;
                const completed = nextIndex >= session.questions.length;
                transaction.update(sessionRef, {
                    eventIds,
                    answers,
                    currentQuestionIndex: completed ? session.currentQuestionIndex : nextIndex,
                    status: completed ? "completed" : "active",
                    practiceQueue: [],
                    practiceIndex: 0,
                    misconception: null,
                    ...(completed ? { completedAt: FieldValue.serverTimestamp() } : {}),
                    updatedAt: FieldValue.serverTimestamp(),
                });
                outcome = completeOrContinue(
                    transaction,
                    { ...session, eventIds, answers, currentQuestionIndex: completed ? session.currentQuestionIndex : nextIndex, status: completed ? "completed" : "active", practiceQueue: [], misconception: null },
                    user.uid,
                    student,
                    config,
                    0,
                    action,
                    correct,
                    localized(question.explanation, session.locale),
                );
                return;
            }

            // ---- Answer on a main quiz question ----------------------------------------
            if (session.status !== "active") throw new Error("REMEDIATION_REQUIRED");
            const delta = scoreDelta(correct ? "correct" : "incorrect");
            const score = session.score + delta;
            const analysis = correct ? null : getOptionAnalysis(question, body.optionId);
            const answer: StoredAnswer = {
                eventId,
                questionId: question.id,
                microTag: question.microTag,
                difficulty: question.difficulty,
                optionId: body.optionId,
                isCorrect: correct,
                scoreDelta: delta,
                answeredAt: new Date(),
                hintUsed,
                practice: false,
                mistakeType: analysis?.mistakeType ?? null,
            };
            const answers = [...(session.answers ?? []), answer];

            if (!correct) {
                const mistakeType = analysis?.mistakeType ?? pendingAnalysis?.mistakeType ?? "computation";
                const profileRef = studentRef.collection("mistakeProfile").doc(mistakeProfileId(question.microTag, mistakeType));
                const priorCount = Number((await transaction.get(profileRef)).data()?.count ?? 0);
                const nextCount = priorCount + 1;
                const misconception = isPossibleMisconception(nextCount, config.misconceptionThreshold);

                transaction.set(studentRef.collection("mistakes").doc(`${session.id}_${eventId}`), {
                    sessionId: session.id,
                    questionId: question.id,
                    microTag: question.microTag,
                    mistakeType,
                    optionId: body.optionId,
                    classLevel: session.classLevel,
                    createdAt: FieldValue.serverTimestamp(),
                }, { merge: true });
                transaction.set(profileRef, {
                    microTag: question.microTag,
                    mistakeType,
                    count: nextCount,
                    possibleMisconception: misconception,
                    lastSeenAt: FieldValue.serverTimestamp(),
                }, { merge: true });

                const queue = misconception ? practiceQueue : [];
                transaction.update(sessionRef, {
                    eventIds,
                    answers,
                    score,
                    status: "remedial_required",
                    remedialTag,
                    ...(misconception
                        ? { misconception: { microTag: question.microTag, mistakeType }, practiceQueue: queue, practiceIndex: 0 }
                        : { misconception: null, practiceQueue: [], practiceIndex: 0 }),
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
                    mistake: analysis
                        ? localizedMistake(mistakeType, localized(analysis.explanation, session.locale), session.locale)
                        : undefined,
                    misconception: misconception && queue.length ? {
                        microTag: question.microTag,
                        type: mistakeType,
                        label: localized(MISTAKE_TYPE_LABELS[mistakeType], session.locale),
                        guidance: localized(MISTAKE_TYPE_GUIDANCE[mistakeType], session.locale),
                        practiceTotal: queue.length,
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
            outcome = completeOrContinue(
                transaction,
                updated,
                user.uid,
                student,
                config,
                delta,
                action,
                true,
                localized(question.explanation, session.locale),
            );
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

function completeOrContinue(
    transaction: FirebaseFirestore.Transaction,
    session: StoredQuizSession,
    uid: string,
    student: FirebaseFirestore.DocumentData,
    config: Awaited<ReturnType<typeof getAssessmentConfig>>,
    delta: number,
    action: "answer" | "remedialComplete",
    isCorrect?: boolean,
    explanation?: string,
): EvaluationOutcome {
    const studentRef = adminDb.collection("students").doc(uid);

    if (session.status !== "completed") {
        const question = activeQuestion(session);
        return {
            success: true,
            action,
            isCorrect,
            explanation,
            score: session.score,
            scoreDelta: delta,
            status: session.status,
            completed: false,
            question: question ? toClientQuestion(question, session.locale) : undefined,
            questionNumber: session.currentQuestionIndex + 1,
            totalQuestions: session.questions.length,
        };
    }

    const percentage = Math.round(masteryPercentage(session.score, session.maxScore));
    const mastered = isMastered(session.score, session.maxScore, config.masteryThresholdPercent);
    const understandingLevel = percentage >= 85 ? "EXCELLENT" : percentage >= 70 ? "GOOD" : percentage >= 50 ? "AVERAGE" : "WEAK";

    const xpEarned = sessionXp(session);
    const totalXp = Number(student.xp ?? 0) + xpEarned;
    const streak = nextStreak(student.streak as Partial<StreakState> | undefined, activityDateKey());
    const quizzesCompleted = Number(student.quizzesCompleted ?? 0) + 1;
    const questionsAnswered = Number(student.questionsAnswered ?? 0) + (session.answers?.length ?? 0);
    const lessonsCompleted = Number(student.lessonsCompleted ?? 0);
    const earnedBadgeIds: string[] = Array.isArray(student.badgeIds) ? student.badgeIds : [];
    const freshBadges = newlyEarnedBadges(
        { lessonsCompleted, quizzesCompleted, questionsAnswered, currentStreak: streak.current },
        earnedBadgeIds,
    );

    transaction.set(studentRef.collection("quizResults").doc(session.id), {
        sessionId: session.id,
        topicName: session.kind === "weekly" ? "Weekly Review" : session.microTag,
        score: session.score,
        maxScore: session.maxScore,
        percentage,
        totalHintsUsed: session.hintedQuestionIds?.length ?? 0,
        totalTimeSeconds: 0,
        xpEarned,
        understandingLevel,
        feedback: mastered ? "Mastery threshold reached." : "Review the prerequisite and try a fresh session.",
        completedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    for (const badgeId of freshBadges) {
        transaction.set(studentRef.collection("badges").doc(badgeId), {
            badgeId,
            earnedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
    }

    transaction.set(studentRef, {
        xp: totalXp,
        streak,
        quizzesCompleted,
        questionsAnswered,
        ...(freshBadges.length ? { badgeIds: FieldValue.arrayUnion(...freshBadges) } : {}),
        ...(session.kind === "weekly"
            ? {
                lastWeeklyAssessmentAt: FieldValue.serverTimestamp(),
                nextWeeklyAssessmentAt: addDays(new Date(), config.weeklyIntervalDays),
                weeklyScorePercent: percentage,
            }
            : {}),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (session.kind !== "weekly") {
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
        xpEarned,
        totalXp,
        streak: streak.current,
        newBadges: freshBadges.map((id) => {
            const badge = BADGE_BY_ID.get(id)!;
            return {
                id,
                title: localized(badge.title, session.locale),
                description: localized(badge.description, session.locale),
                icon: badge.icon,
            };
        }),
    };
}

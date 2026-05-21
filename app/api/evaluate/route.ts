import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { generateFeedback } from "@/lib/openai";
import { calculateUnderstanding, generateUnderstandingSummary } from "@/lib/understanding";
import { FieldValue } from "firebase-admin/firestore";
import { QuizSession, QuizAttempt, QuizResult, StudentAdaptiveState } from "@/types/quiz";

export interface EvaluateRequest {
    sessionId: string;
    questionId: string;
    answer: string;
    timeTakenSeconds: number;
    requestHint?: boolean;
}

export interface EvaluateResponse {
    success: boolean;
    isCorrect?: boolean;
    feedback?: string;
    hint?: string;
    attemptNumber?: number;
    shouldMoveNext?: boolean;
    quizComplete?: boolean;
    result?: QuizResult;
    error?: string;
    levelChanged?: boolean;
    newLevel?: number;
    direction?: "up" | "down" | null;
}

const MAX_ATTEMPTS_PER_QUESTION = 3;

/**
 * POST /api/evaluate
 * Evaluate a quiz answer and provide feedback
 */
export async function POST(request: NextRequest): Promise<NextResponse<EvaluateResponse>> {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" },
                { status: 401 }
            );
        }

        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        const body: EvaluateRequest = await request.json();
        const { sessionId, questionId, answer, timeTakenSeconds, requestHint } = body;

        if (!sessionId || !questionId) {
            return NextResponse.json(
                { success: false, error: "Missing sessionId or questionId" },
                { status: 400 }
            );
        }

        // Get quiz session
        const sessionRef = adminDb
            .collection("students")
            .doc(uid)
            .collection("quizSessions")
            .doc(sessionId);

        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
            return NextResponse.json(
                { success: false, error: "Session not found" },
                { status: 404 }
            );
        }

        const session = sessionDoc.data() as QuizSession;

        // Find the question
        const question = session.questions.find((q) => q.id === questionId);
        if (!question) {
            return NextResponse.json(
                { success: false, error: "Question not found" },
                { status: 404 }
            );
        }

        // Handle hint request
        if (requestHint) {
            await sessionRef.update({
                totalHintsUsed: FieldValue.increment(1),
            });

            return NextResponse.json({
                success: true,
                hint: question.hint,
            });
        }

        // Count previous attempts for this question
        const previousAttempts = (session.attempts || []).filter(
            (a: QuizAttempt) => a.questionId === questionId
        );
        const attemptNumber = previousAttempts.length + 1;

        // Check if answer is correct (case-insensitive, trimmed)
        const normalizedAnswer = answer.trim().toLowerCase();
        const normalizedCorrect = question.correctAnswer.trim().toLowerCase();
        const isCorrect = normalizedAnswer === normalizedCorrect;
        const isLastAttempt = attemptNumber >= MAX_ATTEMPTS_PER_QUESTION;

        // Generate encouraging feedback with reasoning
        const feedback = await generateFeedback(
            question.question,
            answer,
            question.correctAnswer,
            isCorrect,
            attemptNumber,
            isLastAttempt
        );

        // Create attempt record
        const attempt: QuizAttempt = {
            id: `attempt_${Date.now()}`,
            studentUid: uid,
            topicId: session.topicId,
            questionId,
            answer,
            isCorrect,
            hintsUsed: session.totalHintsUsed,
            timeTakenSeconds,
            attemptNumber,
            createdAt: new Date(),
        };

        // Determine if should move to next question
        const shouldMoveNext = isCorrect || attemptNumber >= MAX_ATTEMPTS_PER_QUESTION;

        // Update session
        const updates: Record<string, unknown> = {
            attempts: FieldValue.arrayUnion(attempt),
            totalTimeSeconds: FieldValue.increment(timeTakenSeconds),
        };

        if (isCorrect) {
            updates.score = FieldValue.increment(1);
        }

        if (shouldMoveNext) {
            updates.currentQuestionIndex = session.currentQuestionIndex + 1;
        }

        // Evaluate adaptive logic if moving to next question or finished
        let levelChanged = false;
        let newLevel: number | undefined = undefined;
        let direction: "up" | "down" | null = null;

        if (shouldMoveNext) {
            const stateRef = adminDb.collection("students").doc(uid).collection("studentProgress").doc("adaptiveState");
            const stateDoc = await stateRef.get();
            
            if (stateDoc.exists) {
                const state = stateDoc.data() as StudentAdaptiveState;
                let c_streak = state.correct_streak || 0;
                let w_streak = state.wrong_streak || 0;
                let a_level = state.adaptive_level || 2;
                
                if (isCorrect) {
                    c_streak += 1;
                    w_streak = 0;
                    if (c_streak >= 3 && a_level < 5) {
                        a_level += 1;
                        c_streak = 0;
                        levelChanged = true;
                        direction = "up";
                    }
                } else {
                    w_streak += 1;
                    c_streak = 0;
                    if (w_streak >= 2 && a_level > 1) {
                        a_level -= 1;
                        w_streak = 0;
                        levelChanged = true;
                        direction = "down";
                    }
                }
                
                if (levelChanged) newLevel = a_level;
                
                await stateRef.update({
                    correct_streak: c_streak,
                    wrong_streak: w_streak,
                    adaptive_level: a_level,
                    last_level_change: direction || state.last_level_change,
                    updatedAt: FieldValue.serverTimestamp()
                });

                if (levelChanged) {
                    await adminDb.collection("students").doc(uid).update({ adaptive_level: a_level });
                }
            }
        }

        // Check if quiz is complete
        const isLastQuestion = session.currentQuestionIndex >= session.questions.length - 1;
        const quizComplete = shouldMoveNext && isLastQuestion;

        if (quizComplete) {
            updates.completedAt = FieldValue.serverTimestamp();
        }

        await sessionRef.update(updates);

        // If quiz complete, calculate results
        if (quizComplete) {
            // Fetch updated session to get accurate counts
            const updatedDoc = await sessionRef.get();
            const updatedSession = updatedDoc.data() as QuizSession;

            const allAttempts = [...(updatedSession.attempts || []), attempt];
            const correctCount = allAttempts.filter((a) => a.isCorrect).length;
            const totalTime = updatedSession.totalTimeSeconds + timeTakenSeconds;
            const avgTime = totalTime / session.questions.length;

            const understandingLevel = calculateUnderstanding({
                totalQuestions: session.questions.length,
                correctAnswers: isCorrect ? session.score + 1 : session.score,
                hintsUsed: updatedSession.totalHintsUsed,
                totalTimeSeconds: totalTime,
                averageTimePerQuestion: avgTime,
            });

            const summary = generateUnderstandingSummary(understandingLevel, session.topicName);

            const result: QuizResult = {
                sessionId,
                studentUid: uid,
                topicId: session.topicId,
                topicName: session.topicName,
                score: isCorrect ? session.score + 1 : session.score,
                maxScore: session.questions.length,
                percentage: ((isCorrect ? session.score + 1 : session.score) / session.questions.length) * 100,
                totalHintsUsed: updatedSession.totalHintsUsed,
                totalTimeSeconds: totalTime,
                understandingLevel,
                feedback: summary.message,
                completedAt: new Date(),
            };

            // Store result
            await adminDb
                .collection("students")
                .doc(uid)
                .collection("quizResults")
                .doc(sessionId)
                .set({
                    ...result,
                    completedAt: FieldValue.serverTimestamp(),
                });

            // Update topic progress with understanding level
            await adminDb
                .collection("students")
                .doc(uid)
                .collection("topicProgress")
                .doc(session.topicId)
                .update({
                    understandingLevel,
                    quizCompleted: true,
                    quizScore: result.score,
                    quizMaxScore: result.maxScore,
                    updatedAt: FieldValue.serverTimestamp(),
                });

            return NextResponse.json({
                success: true,
                isCorrect,
                feedback,
                attemptNumber,
                shouldMoveNext,
                quizComplete: true,
                result,
                levelChanged,
                newLevel,
                direction
            });
        }

        return NextResponse.json({
            success: true,
            isCorrect,
            feedback,
            hint: !isCorrect && attemptNumber < MAX_ATTEMPTS_PER_QUESTION ? undefined : undefined,
            attemptNumber,
            shouldMoveNext,
            quizComplete: false,
            levelChanged,
            newLevel,
            direction
        });
    } catch (error) {
        console.error("Evaluate API error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to evaluate answer" },
            { status: 500 }
        );
    }
}

import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { generateQuizQuestions } from "@/lib/openai";
import { FieldValue } from "firebase-admin/firestore";
import { QuizQuestion, QuizSession, Difficulty } from "@/types/quiz";

export interface GenerateQuizRequest {
    topicId: string;
    topicName: string;
    classLevel: number;
}

export interface QuizResponse {
    success: boolean;
    session?: {
        id: string;
        questions: Array<{
            id: string;
            question: string;
            difficulty: Difficulty;
            options?: string[];
        }>;
        totalQuestions: number;
    };
    error?: string;
}

/**
 * POST /api/quiz
 * Generate a new quiz session for a topic
 * Difficulty progression: Easy (2) → Medium (2) → Hard (1)
 */
export async function POST(request: NextRequest): Promise<NextResponse<QuizResponse>> {
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

        const body: GenerateQuizRequest = await request.json();
        const { topicId, topicName, classLevel } = body;

        if (!topicId || !topicName || !classLevel) {
            return NextResponse.json(
                { success: false, error: "Missing required fields" },
                { status: 400 }
            );
        }

        const progressDoc = await adminDb.collection("students").doc(uid).collection("studentProgress").doc("adaptiveState").get();
        let adaptive_level = 2; // default
        if (progressDoc.exists) {
            adaptive_level = progressDoc.data()?.adaptive_level || 2;
        }

        let counts = { easy: 2, medium: 2, hard: 1 };
        switch(adaptive_level) {
            case 1: counts = { easy: 4, medium: 1, hard: 0 }; break;
            case 2: counts = { easy: 2, medium: 3, hard: 0 }; break;
            case 3: counts = { easy: 1, medium: 3, hard: 1 }; break;
            case 4: counts = { easy: 0, medium: 2, hard: 3 }; break;
            case 5: counts = { easy: 0, medium: 1, hard: 4 }; break;
        }

        // Generate questions with mixed difficulty in a single call (faster)
        const generatedQuestions = await import("@/lib/openai").then(m => m.generateMixedQuiz({
            topic: topicName,
            classLevel,
            counts
        }));

        if (generatedQuestions.length === 0) {
            return NextResponse.json(
                { success: false, error: "Failed to generate quiz questions" },
                { status: 500 }
            );
        }

        // Create quiz questions with IDs
        const questions: QuizQuestion[] = generatedQuestions.map((q, index) => ({
            id: `q_${Date.now()}_${index}`,
            question: q.question,
            difficulty: (q.difficulty as Difficulty) || (index < 2 ? "easy" : index < 4 ? "medium" : "hard"),
            correctAnswer: q.correctAnswer,
            hint: q.hint,
            encouragement: q.encouragement,
            options: q.options,
        }));

        // Create quiz session
        const sessionId = `quiz_${uid}_${topicId}_${Date.now()}`;
        const session: Omit<QuizSession, "attempts"> = {
            id: sessionId,
            studentUid: uid,
            topicId,
            topicName,
            questions,
            currentQuestionIndex: 0,
            startedAt: new Date(),
            totalHintsUsed: 0,
            totalTimeSeconds: 0,
            score: 0,
            maxScore: questions.length,
        };

        // Store session in Firestore
        await adminDb
            .collection("students")
            .doc(uid)
            .collection("quizSessions")
            .doc(sessionId)
            .set({
                ...session,
                attempts: [],
                startedAt: FieldValue.serverTimestamp(),
            });

        // Return questions without correct answers (security)
        const clientQuestions = questions.map(({ id, question, difficulty, options }) => ({
            id,
            question,
            difficulty,
            options,
        }));

        return NextResponse.json({
            success: true,
            session: {
                id: sessionId,
                questions: clientQuestions,
                totalQuestions: questions.length,
            },
        });
    } catch (error) {
        console.error("Quiz generation error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to create quiz" },
            { status: 500 }
        );
    }
}

/**
 * GET /api/quiz
 * Get an existing quiz session
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        const sessionId = request.nextUrl.searchParams.get("sessionId");

        if (!sessionId) {
            return NextResponse.json(
                { success: false, error: "Session ID required" },
                { status: 400 }
            );
        }

        const sessionDoc = await adminDb
            .collection("students")
            .doc(uid)
            .collection("quizSessions")
            .doc(sessionId)
            .get();

        if (!sessionDoc.exists) {
            return NextResponse.json(
                { success: false, error: "Session not found" },
                { status: 404 }
            );
        }

        const session = sessionDoc.data() as QuizSession;

        // Return questions without correct answers
        const clientQuestions = session.questions.map(({ id, question, difficulty, options }) => ({
            id,
            question,
            difficulty,
            options,
        }));

        return NextResponse.json({
            success: true,
            session: {
                id: session.id,
                questions: clientQuestions,
                currentQuestionIndex: session.currentQuestionIndex,
                totalHintsUsed: session.totalHintsUsed,
                score: session.score,
                totalQuestions: session.questions.length,
                completedAt: session.completedAt,
            },
        });
    } catch (error) {
        console.error("Quiz fetch error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to fetch quiz" },
            { status: 500 }
        );
    }
}

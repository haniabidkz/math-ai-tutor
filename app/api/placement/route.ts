import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { generatePlacementTest } from "@/lib/openai";
import { FieldValue } from "firebase-admin/firestore";
import { StudentAdaptiveState } from "@/types/quiz";

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        const body = await request.json();
        const { classLevel } = body;

        const questions = await generatePlacementTest(classLevel || 5);

        if (questions.length === 0) {
            return NextResponse.json({ success: false, error: "Failed to generate placement test" }, { status: 500 });
        }

        const questionsWithIds = questions.map((q, i) => ({
            ...q,
            id: `p_${Date.now()}_${i}`
        }));

        const sessionId = `placement_${uid}_${Date.now()}`;
        
        await adminDb
            .collection("students")
            .doc(uid)
            .collection("quizSessions")
            .doc(sessionId)
            .set({
                id: sessionId,
                isPlacement: true,
                questions: questionsWithIds,
                startedAt: FieldValue.serverTimestamp(),
            });

        const clientQuestions = questionsWithIds.map(({ id, question, difficulty, options }) => ({
            id, question, difficulty, options
        }));

        return NextResponse.json({
            success: true,
            sessionId,
            questions: clientQuestions,
        });
    } catch (e) {
        console.error("Placement generation error", e);
        return NextResponse.json({ success: false, error: "Failed to create placement test" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        
        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        const body = await request.json();
        const { sessionId, answers } = body;

        const sessionDoc = await adminDb.collection("students").doc(uid).collection("quizSessions").doc(sessionId).get();
        if (!sessionDoc.exists) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });

        const session = sessionDoc.data()!;
        if (!session.isPlacement) return NextResponse.json({ success: false, error: "Not a placement session" }, { status: 400 });

        let score = 0;
        session.questions.forEach((q: any) => {
            const studentAns = (answers[q.id] || "").trim().toLowerCase();
            const correctAns = (q.correctAnswer || "").trim().toLowerCase();
            if (studentAns === correctAns) {
                score++;
            }
        });

        let assigned_level: 1 | 2 | 3 = 1;
        if (score >= 8) assigned_level = 3;
        else if (score >= 5) assigned_level = 2;

        const adaptiveState: StudentAdaptiveState = {
            uid,
            adaptive_level: assigned_level,
            correct_streak: 0,
            wrong_streak: 0,
            placementCompleted: true,
            last_level_change: null
        };

        await adminDb.collection("students").doc(uid).collection("studentProgress").doc("adaptiveState").set({
            ...adaptiveState,
            updatedAt: FieldValue.serverTimestamp()
        });

        await adminDb.collection("students").doc(uid).update({
            adaptive_level: assigned_level,
            placementCompleted: true,
            updatedAt: FieldValue.serverTimestamp()
        });

        return NextResponse.json({
            success: true,
            score,
            total: session.questions.length,
            assigned_level
        });

    } catch (e) {
        console.error("Placement evaluation error", e);
        return NextResponse.json({ success: false, error: "Failed to evaluate placement test" }, { status: 500 });
    }
}

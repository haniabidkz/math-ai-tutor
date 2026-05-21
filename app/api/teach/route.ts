import { NextRequest, NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase-admin";
import { generateTeaching, ExplanationLanguage } from "@/lib/openai";
import { FieldValue } from "firebase-admin/firestore";

export interface TeachRequest {
    topic: string;
    topicId: string;
    classLevel: number;
    teachingLevel?: 1 | 2 | 3;
    language?: ExplanationLanguage;
    restart?: boolean;
}

export interface TeachResponse {
    success: boolean;
    content?: string;
    teachingLevel?: 1 | 2 | 3;
    attemptsRemaining?: number;
    needsHumanAttention?: boolean;
    error?: string;
}

/**
 * POST /api/teach
 * Generate teaching content for a math topic
 * Enforces 3-level teaching order with max 3 attempts
 */
export async function POST(request: NextRequest): Promise<NextResponse<TeachResponse>> {
    try {
        // Verify authentication
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

        // Parse request body
        const body: TeachRequest = await request.json();
        const { topic, topicId, classLevel, teachingLevel = 1, language = "english", restart = false } = body;

        if (!topic || !topicId || !classLevel) {
            return NextResponse.json(
                { success: false, error: "Missing required fields: topic, topicId, classLevel" },
                { status: 400 }
            );
        }

        // Get or create topic progress
        const progressRef = adminDb
            .collection("students")
            .doc(uid)
            .collection("topicProgress")
            .doc(topicId);

        const progressDoc = await progressRef.get();
        let currentLevel: 1 | 2 | 3 = teachingLevel;
        let attempts = 0;
        let previousExplanations: string[] = [];

        if (progressDoc.exists) {
            const data = progressDoc.data();
            currentLevel = data?.teachingLevel || 1;
            attempts = data?.teachingAttempts || 0;
            previousExplanations = data?.previousExplanations || [];

            if (restart) {
                // Ignore lockouts and start completely fresh
                currentLevel = 1;
                attempts = 0;
                previousExplanations = [];
            } else {
                // Check if already marked as needing human attention
                if (data?.needsHumanAttention) {
                    return NextResponse.json({
                        success: true,
                        needsHumanAttention: true,
                        content: "This topic has been marked for human attention. A teacher or parent will help you with this soon! 🤗",
                        teachingLevel: currentLevel,
                        attemptsRemaining: 0,
                    });
                }

                // Check if already understood
                if (data?.understood) {
                    return NextResponse.json({
                        success: true,
                        content: "You've already learned this topic! Would you like to take a quiz or try a different topic?",
                        teachingLevel: currentLevel,
                        attemptsRemaining: 3,
                    });
                }
            }
        }

        // Check if max attempts reached (3 levels completed without understanding)
        if (attempts >= 3 && currentLevel === 3) {
            // Mark as needing human attention
            await progressRef.set(
                {
                    topicId,
                    topicName: topic,
                    classLevel,
                    teachingLevel: 3,
                    teachingAttempts: attempts,
                    needsHumanAttention: true,
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            return NextResponse.json({
                success: true,
                needsHumanAttention: true,
                content: "You're doing great by trying so hard! 🌟 Let's have a teacher or parent help explain this in a special way just for you. Don't worry - everyone learns differently!",
                teachingLevel: 3,
                attemptsRemaining: 0,
            });
        }

        // Generate teaching content
        const teaching = await generateTeaching({
            topic,
            classLevel,
            teachingLevel: currentLevel,
            previousExplanations,
            language,
        });

        // Update progress in Firestore
        await progressRef.set(
            {
                topicId,
                topicName: topic,
                classLevel,
                teachingLevel: currentLevel,
                teachingAttempts: attempts + 1,
                needsHumanAttention: false,
                understood: false,
                previousExplanations: [...previousExplanations, teaching.content.substring(0, 500)],
                updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );

        return NextResponse.json({
            success: true,
            content: teaching.content,
            teachingLevel: currentLevel,
            attemptsRemaining: 3 - (currentLevel === 3 ? attempts + 1 : 0),
        });
    } catch (error: any) {
        console.error("Teaching API error:", error?.message || error);
        console.error("Teaching API error stack:", error?.stack);

        // Distinguish between auth errors, OpenAI errors, and Firestore errors
        const errorMessage = error?.message || "Unknown error";

        if (errorMessage.includes("auth") || errorMessage.includes("token") || errorMessage.includes("Firebase ID token")) {
            return NextResponse.json(
                { success: false, error: "Authentication failed. Please sign in again." },
                { status: 401 }
            );
        }

        if (errorMessage.includes("OpenAI") || errorMessage.includes("API key") || errorMessage.includes("429") || errorMessage.includes("quota")) {
            return NextResponse.json(
                { success: false, error: "AI service is temporarily unavailable. Please try again later." },
                { status: 503 }
            );
        }

        return NextResponse.json(
            { success: false, error: "Failed to generate teaching content. Please try again." },
            { status: 500 }
        );
    }
}

/**
 * PATCH /api/teach
 * Update teaching progress (move to next level or mark as understood)
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
    try {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const token = authHeader.split("Bearer ")[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        const body = await request.json();
        const { topicId, understood } = body;

        if (!topicId) {
            return NextResponse.json(
                { success: false, error: "Missing topicId" },
                { status: 400 }
            );
        }

        const progressRef = adminDb
            .collection("students")
            .doc(uid)
            .collection("topicProgress")
            .doc(topicId);

        const progressDoc = await progressRef.get();

        if (understood) {
            // Mark topic as understood
            await progressRef.update({
                understood: true,
                completedAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });

            return NextResponse.json({
                success: true,
                message: "Great job! Topic marked as understood! 🎉",
                nextStep: "quiz",
            });
        } else {
            // Move to next teaching level
            const currentLevel = progressDoc.data()?.teachingLevel || 1;
            const nextLevel = Math.min(currentLevel + 1, 3) as 1 | 2 | 3;

            await progressRef.update({
                teachingLevel: nextLevel,
                updatedAt: FieldValue.serverTimestamp(),
            });

            return NextResponse.json({
                success: true,
                message: "No problem! Let me try explaining it a different way.",
                nextLevel,
            });
        }
    } catch (error) {
        console.error("Teaching update error:", error);
        return NextResponse.json(
            { success: false, error: "Failed to update progress" },
            { status: 500 }
        );
    }
}

import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { addDays, nextDiagnosticDifficulty } from "@/lib/adaptive-engine";
import { getAssessmentConfig, selectQuestion, toClientQuestion } from "@/lib/assessment-content";
import { buildDiagnosticProfile, type StoredAnswer } from "@/lib/assessment-session";
import { getDiagnosticPool } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { authErrorResponse, requireVerifiedUser } from "@/lib/server-auth";
import type { Difficulty, Locale, QuestionBankItem, StudentClassLevel } from "@/types/curriculum";

interface PlacementSession {
    id: string;
    kind: "diagnostic";
    classLevel: StudentClassLevel;
    locale: Locale;
    status: "active" | "completed";
    currentDifficulty: Difficulty;
    currentQuestionIndex: number;
    questionCount: number;
    score: number;
    questions: QuestionBankItem[];
    answers: StoredAnswer[];
    eventIds: string[];
}

function parseClass(value: unknown): StudentClassLevel | null {
    const classLevel = Number(value);
    return classLevel === 6 || classLevel === 7 || classLevel === 8 ? classLevel : null;
}

function parseLocale(value: unknown): Locale {
    return value === "roman-urdu" ? "roman-urdu" : "english";
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireVerifiedUser(request, ["student"]);
        const body = await request.json();
        const profileSnapshot = await adminDb.collection("students").doc(user.uid).get();
        const classLevel = parseClass(body.classLevel) ?? parseClass(profileSnapshot.data()?.class);
        if (!classLevel) return NextResponse.json({ success: false, error: "Class must be 6, 7, or 8" }, { status: 400 });

        const locale = parseLocale(body.locale);
        const config = await getAssessmentConfig();
        const pool = getDiagnosticPool(classLevel);
        const firstQuestion = await selectQuestion({ microTag: pool[0].microTag, difficulty: "medium" });
        const sessionId = `diagnostic_${randomUUID()}`;
        const session: PlacementSession = {
            id: sessionId,
            kind: "diagnostic",
            classLevel,
            locale,
            status: "active",
            currentDifficulty: "medium",
            currentQuestionIndex: 0,
            questionCount: config.diagnosticQuestionCount,
            score: 0,
            questions: [firstQuestion],
            answers: [],
            eventIds: [],
        };

        await adminDb.collection("students").doc(user.uid).collection("assessmentSessions").doc(sessionId).set({
            ...session,
            startedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
            success: true,
            sessionId,
            question: toClientQuestion(firstQuestion, locale),
            questionNumber: 1,
            totalQuestions: session.questionCount,
        });
    } catch (error) {
        console.error("Diagnostic start error", error);
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to start diagnostic" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = await requireVerifiedUser(request, ["student"]);
        const body = await request.json();
        const { sessionId, eventId, questionId, optionId } = body;
        if (![sessionId, eventId, questionId, optionId].every((value) => typeof value === "string" && value)) {
            return NextResponse.json({ success: false, error: "sessionId, eventId, questionId, and optionId are required" }, { status: 400 });
        }

        const sessionRef = adminDb.collection("students").doc(user.uid).collection("assessmentSessions").doc(sessionId);
        const initialSnapshot = await sessionRef.get();
        if (!initialSnapshot.exists) return NextResponse.json({ success: false, error: "Diagnostic session not found" }, { status: 404 });
        const initial = initialSnapshot.data() as PlacementSession;
        if (initial.kind !== "diagnostic") return NextResponse.json({ success: false, error: "Invalid diagnostic session" }, { status: 400 });
        if (initial.status === "completed") return NextResponse.json({ success: true, completed: true, profile: initialSnapshot.data()?.profile });

        const current = initial.questions[initial.currentQuestionIndex];
        if (!current || current.id !== questionId) return NextResponse.json({ success: false, error: "Question is no longer current" }, { status: 409 });
        const isCorrect = optionId === current.correctOptionId;
        const answers = [...(initial.answers ?? []), {
            eventId,
            questionId,
            optionId,
            isCorrect,
            scoreDelta: isCorrect ? 1 : -1,
            difficulty: current.difficulty,
            microTag: current.microTag,
            answeredAt: new Date(),
        } satisfies StoredAnswer];
        const nextDifficulty = nextDiagnosticDifficulty(initial.currentDifficulty, answers.map((answer) => answer.isCorrect));
        const completed = answers.length >= initial.questionCount;
        const pool = getDiagnosticPool(initial.classLevel);
        const nextConcept = pool[answers.length % pool.length];
        const nextQuestion = completed ? null : await selectQuestion({
            microTag: nextConcept.microTag,
            difficulty: nextDifficulty,
            usedIds: initial.questions.map((question) => question.id),
        });
        const profile = completed
            ? buildDiagnosticProfile(answers, initial.classLevel, pool[0].microTag, nextDifficulty)
            : null;
        let duplicate = false;

        await adminDb.runTransaction(async (transaction) => {
            const latestSnapshot = await transaction.get(sessionRef);
            const latest = latestSnapshot.data() as PlacementSession | undefined;
            if (!latest) throw new Error("Diagnostic session not found");
            if (latest.eventIds?.includes(eventId)) {
                duplicate = true;
                return;
            }
            if (latest.currentQuestionIndex !== initial.currentQuestionIndex || latest.questions[latest.currentQuestionIndex]?.id !== questionId) {
                throw new Error("STALE_DIAGNOSTIC_EVENT");
            }

            transaction.update(sessionRef, {
                answers,
                eventIds: [...(latest.eventIds ?? []), eventId],
                score: (latest.score ?? 0) + (isCorrect ? 1 : -1),
                currentDifficulty: nextDifficulty,
                currentQuestionIndex: completed ? latest.currentQuestionIndex : latest.currentQuestionIndex + 1,
                questions: nextQuestion ? [...latest.questions, nextQuestion] : latest.questions,
                status: completed ? "completed" : "active",
                ...(profile ? { profile, completedAt: FieldValue.serverTimestamp() } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            });

            if (profile) {
                transaction.set(adminDb.collection("students").doc(user.uid), {
                    diagnosticCompleted: true,
                    placementCompleted: true,
                    diagnosticProfile: profile,
                    adaptive_level: nextDifficulty === "easy" ? 1 : nextDifficulty === "medium" ? 2 : 3,
                    nextWeeklyAssessmentAt: addDays(new Date(), 7),
                    updatedAt: FieldValue.serverTimestamp(),
                }, { merge: true });
            }
        });

        if (duplicate) {
            const latest = (await sessionRef.get()).data() as PlacementSession;
            return NextResponse.json({
                success: true,
                duplicate: true,
                completed: latest.status === "completed",
                profile: (latest as PlacementSession & { profile?: unknown }).profile,
                question: latest.status === "active" ? toClientQuestion(latest.questions[latest.currentQuestionIndex], latest.locale) : undefined,
                questionNumber: latest.currentQuestionIndex + 1,
                totalQuestions: latest.questionCount,
            });
        }

        return NextResponse.json({
            success: true,
            isCorrect,
            completed,
            profile,
            question: nextQuestion ? toClientQuestion(nextQuestion, initial.locale) : undefined,
            questionNumber: completed ? initial.questionCount : answers.length + 1,
            totalQuestions: initial.questionCount,
        });
    } catch (error) {
        console.error("Diagnostic answer error", error);
        const auth = authErrorResponse(error);
        const status = error instanceof Error && error.message === "STALE_DIAGNOSTIC_EVENT" ? 409 : 500;
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: status === 409 ? "Answer already processed; reload the session" : "Failed to record diagnostic answer" }, { status });
    }
}

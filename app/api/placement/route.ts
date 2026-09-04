import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { addDays, nextDiagnosticDifficulty } from "@/lib/adaptive-engine";
import { getAssessmentConfig, selectQuestion, toClientQuestion } from "@/lib/assessment-content";
import { buildDiagnosticProfile, type StoredAnswer } from "@/lib/assessment-session";
import { getClassConcepts } from "@/lib/curriculum";
import { DIAGNOSTIC_QUESTION_COUNT, getDiagnosticConceptOrder } from "@/lib/diagnostic-blueprint";
import { getOptionAnalysis, isPossibleMisconception, mistakeProfileId, MISCONCEPTIONS } from "@/lib/mistake-analysis";
import { adminDb } from "@/lib/firebase-admin";
import { buildQuestionHistory, type HistoricalQuestionSession } from "@/lib/question-history";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
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
    seenQuestionIds?: string[];
    previousAttemptQuestionIds?: string[];
}

function parseClass(value: unknown): StudentClassLevel | null {
    const classLevel = Number(value);
    return classLevel === 6 || classLevel === 7 || classLevel === 8 ? classLevel : null;
}

function parseLocale(value: unknown): Locale {
    return value === "roman-urdu" ? "roman-urdu" : "english";
}

async function diagnosticHistory(studentUid: string) {
    const snapshot = await adminDb.collection("students").doc(studentUid).collection("assessmentSessions").get();
    return buildQuestionHistory(
        snapshot.docs.map((document) => document.data() as HistoricalQuestionSession),
        (session) => session.kind === "diagnostic",
    );
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const body = await request.json();
        const profileSnapshot = await adminDb.collection("students").doc(user.uid).get();
        const classLevel = parseClass(profileSnapshot.data()?.class);
        if (!classLevel) return NextResponse.json({ success: false, error: "Student profile class must be 6, 7, or 8" }, { status: 409 });

        const locale = parseLocale(body.locale);
        // The diagnostic is a fixed blueprint: five topics of three questions each.
        const questionCount = DIAGNOSTIC_QUESTION_COUNT;
        const sequence = getDiagnosticConceptOrder(classLevel);
        const history = await diagnosticHistory(user.uid);
        const firstQuestion = await selectQuestion({
            microTag: sequence[0].microTag,
            difficulty: "medium",
            usedIds: history.seenIds,
            previousAttemptIds: history.previousAttemptIds,
        });
        const sessionId = `diagnostic_${randomUUID()}`;
        const session: PlacementSession = {
            id: sessionId,
            kind: "diagnostic",
            classLevel,
            locale,
            status: "active",
            currentDifficulty: "medium",
            currentQuestionIndex: 0,
            questionCount,
            score: 0,
            questions: [firstQuestion],
            answers: [],
            eventIds: [],
            seenQuestionIds: history.seenIds,
            previousAttemptQuestionIds: history.previousAttemptIds,
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
        const user = await requireUser(request, ["student"]);
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
        // Analysis is recorded for the backend only; the diagnostic never shows it.
        const analysis = isCorrect ? null : getOptionAnalysis(current, optionId);
        const answers = [...(initial.answers ?? []), {
            eventId,
            questionId,
            optionId,
            isCorrect,
            scoreDelta: isCorrect ? 1 : -1,
            difficulty: current.difficulty,
            microTag: current.microTag,
            answeredAt: new Date(),
            mistakeType: analysis?.mistakeType ?? null,
            misconceptionTag: analysis?.misconceptionTag ?? null,
        } satisfies StoredAnswer];
        const sequence = getDiagnosticConceptOrder(initial.classLevel);
        const nextDifficulty = nextDiagnosticDifficulty(initial.currentDifficulty, answers.map((answer) => answer.isCorrect));
        const completed = answers.length >= sequence.length;
        const nextConcept = sequence[answers.length];
        const nextQuestion = completed ? null : await selectQuestion({
            microTag: nextConcept.microTag,
            difficulty: nextDifficulty,
            usedIds: [...(initial.seenQuestionIds ?? []), ...initial.questions.map((question) => question.id)],
            previousAttemptIds: [
                ...(initial.previousAttemptQuestionIds ?? []),
                ...initial.questions.map((question) => question.id),
            ],
        });
        const profile = completed
            ? buildDiagnosticProfile(answers, initial.classLevel, getClassConcepts(initial.classLevel)[0].microTag, nextDifficulty)
            : null;
        let duplicate = false;

        const studentRef = adminDb.collection("students").doc(user.uid);
        const profileRef = analysis
            ? studentRef.collection("mistakeProfile").doc(mistakeProfileId(current.microTag, analysis.misconceptionTag))
            : null;

        await adminDb.runTransaction(async (transaction) => {
            const latestSnapshot = await transaction.get(sessionRef);
            const priorMistakeCount = profileRef ? Number((await transaction.get(profileRef)).data()?.count ?? 0) : 0;
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

            if (analysis && profileRef) {
                const nextCount = priorMistakeCount + 1;
                transaction.set(studentRef.collection("mistakes").doc(`${sessionId}_${eventId}`), {
                    sessionId,
                    questionId,
                    microTag: current.microTag,
                    mistakeType: analysis.mistakeType,
                    misconceptionTag: analysis.misconceptionTag,
                    optionId,
                    source: "diagnostic",
                    classLevel: initial.classLevel,
                    createdAt: FieldValue.serverTimestamp(),
                }, { merge: true });
                transaction.set(profileRef, {
                    microTag: current.microTag,
                    mistakeType: analysis.mistakeType,
                    misconceptionTag: analysis.misconceptionTag,
                    count: nextCount,
                    possibleMisconception: isPossibleMisconception(nextCount),
                    lastSeenAt: FieldValue.serverTimestamp(),
                }, { merge: true });
            }

            if (profile) {
                transaction.set(studentRef, {
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

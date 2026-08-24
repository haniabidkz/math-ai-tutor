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
import { getClassConcepts, getConcept } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
import type { Difficulty, Locale, QuestionBankItem, StudentClassLevel } from "@/types/curriculum";

function parseLocale(value: unknown): Locale {
    return value === "roman-urdu" ? "roman-urdu" : "english";
}

function parseClass(value: unknown): StudentClassLevel | null {
    const parsed = Number(value);
    return parsed === 6 || parsed === 7 || parsed === 8 ? parsed : null;
}

async function weeklyQuestions(classLevel: StudentClassLevel, weakTags: string[], count: number, excludedIds: string[]) {
    const tags = [...weakTags, ...getClassConcepts(classLevel).map((concept) => concept.microTag)];
    const uniqueTags = [...new Set(tags)];
    const selected: QuestionBankItem[] = [];
    for (let index = 0; selected.length < count && uniqueTags.length; index += 1) {
        const microTag = uniqueTags[index % uniqueTags.length];
        const question = await selectQuestion({ microTag, usedIds: [...excludedIds, ...selected.map((item) => item.id)] });
        if (!selected.some((item) => item.id === question.id)) selected.push(question);
        if (index > count * uniqueTags.length) break;
    }
    return selected;
}

async function mostRecentQuestionIds(
    studentUid: string,
    kind: "mastery" | "weekly",
    microTag: string,
): Promise<string[]> {
    const snapshot = await adminDb.collection("students").doc(studentUid).collection("assessmentSessions").get();
    const previous = snapshot.docs
        .map((document) => document.data() as StoredQuizSession & { startedAt?: { toMillis?: () => number } })
        .filter((session) => session.kind === kind && session.microTag === microTag)
        .sort((left, right) => (right.startedAt?.toMillis?.() ?? 0) - (left.startedAt?.toMillis?.() ?? 0))[0];
    return previous?.questions?.map((question) => question.id) ?? [];
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const body = await request.json();
        const profileSnapshot = await adminDb.collection("students").doc(user.uid).get();
        const profile = profileSnapshot.data() ?? {};
        const classLevel = parseClass(profile.class) ?? parseClass(body.classLevel);
        if (!classLevel) return NextResponse.json({ success: false, error: "Class must be 6, 7, or 8" }, { status: 400 });

        const kind: "mastery" | "weekly" = body.kind === "weekly" ? "weekly" : "mastery";
        const locale = parseLocale(body.locale);
        const preferredDifficulty: Difficulty = body.difficulty === "easy" || body.difficulty === "hard" ? body.difficulty : "medium";
        const config = await getAssessmentConfig();
        let microTag = String(body.microTag ?? body.topicId ?? "");
        if (!microTag && kind === "mastery") return NextResponse.json({ success: false, error: "microTag is required" }, { status: 400 });
        if (microTag && !getConcept(microTag)) {
            const byTopic = getClassConcepts(classLevel).find((concept) => concept.topicId === microTag);
            microTag = byTopic?.microTag ?? microTag;
        }

        const previousQuestionIds = await mostRecentQuestionIds(user.uid, kind, kind === "weekly" ? "weekly-review" : microTag);
        const questions = kind === "weekly"
            ? await weeklyQuestions(classLevel, profile.diagnosticProfile?.weakMicroTags ?? [], config.weeklyQuestionCount, previousQuestionIds)
            : await selectQuizQuestions(microTag, config.masteryQuestionCount, preferredDifficulty, previousQuestionIds);
        if (!questions.length) return NextResponse.json({ success: false, error: "No published questions are available" }, { status: 409 });
        if (kind === "weekly") microTag = "weekly-review";
        else if (!(await getPublishedConcept(microTag))) return NextResponse.json({ success: false, error: "Concept not found" }, { status: 404 });

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
        };
        await adminDb.collection("students").doc(user.uid).collection("assessmentSessions").doc(sessionId).set({
            ...session,
            startedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });

        return NextResponse.json({
            success: true,
            session: {
                id: sessionId,
                kind,
                microTag,
                question: toClientQuestion(questions[0], locale),
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

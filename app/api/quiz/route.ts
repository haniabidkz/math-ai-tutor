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
import { currentQuizQuestion, type StoredQuizSession } from "@/lib/assessment-session";
import { findPreviousClassTopic, foundationProgress, type FoundationSource } from "@/lib/foundation-fallback";
import { getClassConcepts, getConcept, isLearningConceptForClass } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { buildConceptItems } from "@/lib/learner-metrics";
import { buildQuestionHistory, type HistoricalQuestionSession } from "@/lib/question-history";
import { orderByFreshness, takeNextQuestion, targetDifficulty } from "@/lib/question-selection";
import { getOptionAnalysis, MISCONCEPTIONS } from "@/lib/mistake-analysis";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
import { cleanMathText } from "@/lib/text-clean";
import type { LocalizedOption } from "@/types/curriculum";
import type { Locale, QuestionBankItem, StudentClassLevel } from "@/types/curriculum";

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
        const progressSnapshot = kind === "mastery" ? await adminDb.collection("students").doc(user.uid).collection("conceptProgress").get() : null;
        const conceptProgress = progressSnapshot?.docs.find((doc) => doc.id === microTag)?.data();
        if (kind === "mastery") {
            const concept = await getPublishedConcept(microTag);
            if (!concept) return NextResponse.json({ success: false, error: "Concept not found" }, { status: 404 });
            if (!isLearningConceptForClass(concept, classLevel)) {
                return NextResponse.json({ success: false, error: `This concept is not available for Class ${classLevel}` }, { status: 400 });
            }
            topicTitle = concept.title.english;
            const concepts = await getRuntimeConcepts();
            // Lessons unlock one after another; homework set by a teacher opens its lesson regardless.
            if (!homeworkId) {
                const items = buildConceptItems(concepts, classLevel, new Map(progressSnapshot!.docs.map((doc) => [doc.id, doc.data()])), new Set(profile.diagnosticProfile?.strongMicroTags ?? []));
                const item = items.find((entry) => entry.microTag === microTag);
                if (item?.locked && item.blockedBy) {
                    return NextResponse.json({ success: false, code: "locked", error: `Finish "${item.blockedBy.title.english}" first. Lessons unlock one after another.` }, { status: 409 });
                }
            }
            // The same topic one class down, ready in case the student struggles with this one.
            foundationSource = findPreviousClassTopic(concept, concepts);
        }

        // A lesson the student already fell short on opens the previous-class round after one miss.
        const struggledBefore = kind === "mastery" && typeof conceptProgress?.percentage === "number" && conceptProgress.percentage < config.masteryThresholdPercent;

        // A quiz left midway continues where it stopped: the latest unfinished session for the same
        // lesson (and homework) comes back instead of a new one, unless a retry was asked for.
        if (typeof body.retryOf !== "string") {
            const open = await latestOpenSession(user.uid, kind, kind === "weekly" ? "weekly-review" : microTag, homeworkId);
            if (open) return NextResponse.json({ success: true, session: await describeSession(open, locale, true) });
        }

        const history = await questionHistory(user.uid, kind, kind === "weekly" ? "weekly-review" : microTag);
        let questions: QuestionBankItem[];
        let pool: QuestionBankItem[] | null = null;
        let questionCount: number;
        if (kind === "weekly") {
            questions = await weeklyQuestions(
                classLevel,
                profile.diagnosticProfile?.weakMicroTags ?? [],
                config.weeklyQuestionCount,
                history.seenIds,
                history.previousAttemptIds,
            );
            questionCount = questions.length;
        } else {
            // Adaptive: the lesson's pool travels with the session, unseen questions first. The
            // quiz opens on an easy question and routes each next one by the answer before it.
            const candidates = orderByFreshness(await getPublishedQuestions(microTag), history.seenIds, history.previousAttemptIds);
            questionCount = Math.min(Number(homework?.questionCount ?? config.masteryQuestionCount), candidates.length);
            const first = takeNextQuestion(candidates, targetDifficulty(0, null));
            questions = first ? [first.question] : [];
            pool = first ? first.pool : [];
        }
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
            maxScore: questionCount,
            questionCount,
            ...(pool ? { pool } : {}),
            lastMainResult: null,
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
                // The whole pool is sent so the student can keep answering without a network.
                questions: [...questions, ...(pool ?? [])].map((item) => toClientQuestion(item, locale)),
                questionNumber: 1,
                totalQuestions: questionCount,
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

/** The newest session on this lesson that was not finished, so a refresh or a return picks it up. */
async function latestOpenSession(studentUid: string, kind: "mastery" | "weekly", microTag: string, homeworkId: string | null): Promise<StoredQuizSession | null> {
    const snapshot = await adminDb.collection("students").doc(studentUid).collection("assessmentSessions")
        .where("kind", "==", kind).where("microTag", "==", microTag).get();
    const millis = (value: unknown) => (value && typeof (value as { toMillis?: () => number }).toMillis === "function" ? (value as { toMillis: () => number }).toMillis() : 0);
    const open = snapshot.docs
        .map((doc) => doc.data() as StoredQuizSession & { startedAt?: unknown; updatedAt?: unknown })
        .filter((session) => session.status !== "completed" && (session.homeworkId ?? null) === homeworkId && Array.isArray(session.questions) && session.questions.length > 0)
        .sort((left, right) => millis(right.updatedAt ?? right.startedAt) - millis(left.updatedAt ?? left.startedAt));
    return open[0] ?? null;
}

/**
 * A session as the quiz screen needs it: the current question, the whole list for offline
 * answering, how the lesson's own questions went so far, and, when the student left on the
 * review screen, everything that screen showed.
 */
async function describeSession(session: StoredQuizSession, locale: Locale, resumed = false) {
    const current = currentQuizQuestion(session);
    const total = session.questionCount ?? session.questions.length;
    const everyQuestion = [...session.questions, ...(session.pool ?? []), ...(session.practiceQueue ?? []), ...(session.foundation?.queue ?? [])];
    const practiceIndex = session.practiceIndex ?? 0;
    const practiceTotal = session.practiceQueue?.length ?? 0;
    const misconception = session.misconception && (session.status === "misconception_practice" || session.status === "remedial_required") && practiceTotal > 0
        ? {
            microTag: session.misconception.microTag,
            type: session.misconception.mistakeType,
            tag: session.misconception.misconceptionTag,
            label: MISCONCEPTIONS[session.misconception.misconceptionTag]?.label.english ?? "",
            guidance: MISCONCEPTIONS[session.misconception.misconceptionTag]?.guidance ?? { english: "", romanUrdu: "" },
            practiceTotal,
        }
        : undefined;
    const base = {
        id: session.id,
        kind: session.kind,
        homeworkId: session.homeworkId ?? null,
        microTag: session.microTag,
        classLevel: session.classLevel,
        status: session.status,
        score: session.score,
        maxScore: session.maxScore,
        questionNumber: Math.min(session.currentQuestionIndex + 1, total),
        totalQuestions: total,
        question: current ? toClientQuestion(current, locale) : undefined,
        questions: [...session.questions, ...(session.pool ?? [])].map((item) => toClientQuestion(item, locale)),
        remedialTag: session.remedialTag,
        resumed,
        mainResults: (session.answers ?? []).filter((answer) => !answer.practice).map((answer) => answer.isCorrect),
        foundation: session.status === "foundation_practice" && session.foundationSource && session.foundation
            ? foundationProgress(session.foundationSource, session.foundation)
            : undefined,
        practice: session.status === "misconception_practice" ? { number: practiceIndex + 1, total: practiceTotal, isRecheck: practiceIndex === practiceTotal - 1 } : undefined,
        misconception,
    };
    if (session.status !== "remedial_required") return base;

    // The review screen, rebuilt from the answer that opened it.
    const last = [...(session.answers ?? [])].reverse().find((answer) => !answer.practice);
    const question = last ? everyQuestion.find((item) => item.id === last.questionId) : undefined;
    const analysis = question && last ? getOptionAnalysis(question, last.optionId as LocalizedOption["id"]) : null;
    let remedialConcept = session.remedialTag ? await getPublishedConcept(session.remedialTag) : undefined;
    if (!remedialConcept) remedialConcept = await getPublishedConcept(question?.microTag ?? session.microTag);
    const option = (id: string) => ({ id, text: cleanMathText(question?.options.find((item) => item.id === id)?.english ?? "") });
    return {
        ...base,
        review: {
            remedial: remedialConcept ? { microTag: remedialConcept.microTag, title: remedialConcept.title, concept: remedialConcept.concept, visualKind: remedialConcept.visualKind, imageUrl: remedialConcept.imageUrl } : undefined,
            mistake: analysis ? { type: analysis.mistakeType, tag: analysis.misconceptionTag, label: MISCONCEPTIONS[analysis.misconceptionTag]?.label.english ?? "", whyWrong: analysis.whyWrong } : undefined,
            explanation: question?.explanation,
            answer: question && last ? { selected: option(last.optionId), correct: option(question.correctOptionId) } : undefined,
            foundation: session.foundation && session.foundationSource && !session.foundation.outcome && session.foundation.index === 0
                ? foundationProgress(session.foundationSource, session.foundation)
                : undefined,
        },
    };
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student"]);
        const sessionId = request.nextUrl.searchParams.get("sessionId");
        if (!sessionId) return NextResponse.json({ success: false, error: "sessionId is required" }, { status: 400 });
        const snapshot = await adminDb.collection("students").doc(user.uid).collection("assessmentSessions").doc(sessionId).get();
        if (!snapshot.exists) return NextResponse.json({ success: false, error: "Session not found" }, { status: 404 });
        return NextResponse.json({ success: true, session: await describeSession(snapshot.data() as StoredQuizSession, "english") });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load quiz" }, { status: 500 });
    }
}

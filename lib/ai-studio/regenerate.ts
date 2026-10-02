import { AiError, completeJson } from "@/lib/ai-studio/ai";
import { verificationFromAnswer, type CheckerAnswer } from "@/lib/ai-studio/check";
import { findForeignContext } from "@/lib/ai-studio/context-check";
import { checkerTopic, rewritePrompt, verificationPrompt } from "@/lib/ai-studio/prompts";
import { normalizeQuestionBatch, questionBatchSchema, verificationSchema } from "@/lib/ai-studio/schema";
import { findNearCopy, questionSignature } from "@/lib/ai-studio/similarity";
import { chapterConcepts } from "@/lib/ai-studio/target";
import { questionRomanUrduProblems } from "@/lib/ai-studio/urdu-check";
import type { DraftConcept, DraftQuestion, GenerationDraft, RewriteReason } from "@/lib/ai-studio/types";
import { brevityIssues, normalizeText } from "@/lib/ai-studio/validate";
import type { MicroConcept, QuestionBankItem, StudentClassLevel } from "@/types/curriculum";

/**
 * The Super Admin's Regenerate button: one flagged question is written again for the same
 * micro-topic and difficulty, held to every rule a new pool follows, and solved again by the
 * independent checker. A reply that breaks a rule or fails the check is redone with the reasons.
 */

export type RewriteContext = Pick<GenerationDraft, "level" | "target" | "concept">;
export type RewriteOriginal = Pick<DraftQuestion, "difficulty" | "microTag" | "questionText" | "options" | "correctOption" | "skill">;

export interface RewriteInput {
    context: RewriteContext;
    original: RewriteOriginal;
    reason: RewriteReason;
    note?: string;
    /** Questions the replacement must not repeat; the flagged question is added automatically. */
    avoid: string[];
}

export interface RewriteOutcome {
    question: DraftQuestion;
    /** True when the checker agrees with the marked answer and finds the question on topic. */
    passed: boolean;
    attempts: number;
    usage: { calls: number; inputTokens: number; outputTokens: number };
}

const REASONING_BY_DIFFICULTY = { easy: "low", medium: "medium", hard: "high" } as const;
const MAX_ATTEMPTS = 3;
/** The whole rewrite must finish inside the 300-second function limit. */
const TOTAL_BUDGET_MS = 270_000;
/** Time kept back for the checker after each write. */
const CHECK_RESERVE_MS = 60_000;
/** A new attempt starts only with this much time left. */
const MIN_ATTEMPT_MS = 110_000;

/** The same rule checks a generated batch goes through, for one question. */
function ruleProblems(question: DraftQuestion, seen: Set<string>, signatures: ReturnType<typeof questionSignature>[], avoid: string[]): string[] {
    const problems: string[] = [];
    const foreign = findForeignContext(question.questionText, ...question.options, question.hint.english, question.solution.english);
    if (foreign.length) problems.push(`it uses a foreign setting (${foreign.join(", ")}); use Pakistani daily life, Rupees and kilometres`);
    for (const issue of brevityIssues(question)) {
        if (issue.severity === "error") problems.push(issue.message);
    }
    problems.push(...questionRomanUrduProblems("the", question));
    const text = normalizeText(question.questionText);
    if (seen.has(text)) problems.push("it repeats an existing question");
    else {
        const copied = findNearCopy(text, signatures);
        if (copied >= 0) problems.push(`it is almost the same as an existing question ("${avoid[copied].slice(0, 80)}"); change the idea or situation, not just the numbers`);
    }
    return problems;
}

function checkFeedback(question: DraftQuestion): string[] {
    const { verification } = question;
    const feedback: string[] = [];
    if (verification.status === "disagrees") {
        feedback.push(verification.aiAnswer
            ? `an independent solve chose option ${verification.aiAnswer}, not ${question.correctOption}; work the answer out again and make sure exactly one option equals it`
            : "an independent solve found no option equal to the right answer, or two equal options; make exactly one option correct");
    }
    if (verification.status === "error") feedback.push("the answer could not be checked; keep the question short and clear");
    if (verification.onTopic === false) feedback.push(`it went outside the micro-topic${verification.topicNote ? `: ${verification.topicNote}` : ""}`);
    return feedback;
}

export async function rewriteQuestion(input: RewriteInput, now: () => number = Date.now): Promise<RewriteOutcome> {
    const started = now();
    const remaining = () => TOTAL_BUDGET_MS - (now() - started);
    const { context, original } = input;
    const tag = original.microTag;
    const skills = context.concept?.scope?.covers ?? [];
    const avoid = [...input.avoid.filter((text) => text.trim()), ...(original.questionText.trim() ? [original.questionText] : [])];
    const seen = new Set(avoid.map(normalizeText));
    const signatures = avoid.map((text) => questionSignature(text));
    const usage = { calls: 0, inputTokens: 0, outputTokens: 0 };
    let feedback: string[] = [];
    let best: DraftQuestion | null = null;
    let attempts = 0;

    while (attempts < MAX_ATTEMPTS && (attempts === 0 || remaining() >= MIN_ATTEMPT_MS)) {
        attempts += 1;
        const prompt = rewritePrompt(context, { original, reason: input.reason, note: input.note, avoid, feedback });
        const reply = await completeJson<unknown>({
            role: "generation", ...prompt, schemaName: "question_pool", schema: questionBatchSchema([tag], skills),
            temperature: 0.7, maxOutputTokens: 16_000, timeoutMs: 100_000,
            budgetMs: Math.max(30_000, remaining() - CHECK_RESERVE_MS),
            reasoningEffort: REASONING_BY_DIFFICULTY[original.difficulty],
        });
        usage.calls += 1;
        usage.inputTokens += reply.usage.inputTokens;
        usage.outputTokens += reply.usage.outputTokens;

        const { questions, problems } = normalizeQuestionBatch(reply.data, { difficulty: original.difficulty, count: 1, allowedTags: [tag], skills });
        const candidate = questions[0];
        if (candidate) problems.push(...ruleProblems(candidate, seen, signatures, avoid));
        if (!candidate || problems.length) {
            feedback = problems;
            continue;
        }

        const check = await completeJson<{ answers: CheckerAnswer[] }>({
            role: "verification",
            ...verificationPrompt([{ ...candidate, key: "q1", topic: checkerTopic(context, tag) }], context.level),
            schemaName: "independent_solve", schema: verificationSchema,
            maxOutputTokens: 16_000, timeoutMs: 90_000, budgetMs: Math.max(20_000, remaining()),
            reasoningEffort: "high",
        });
        usage.calls += 1;
        usage.inputTokens += check.usage.inputTokens;
        usage.outputTokens += check.usage.outputTokens;

        const answer = (check.data.answers ?? []).find((item) => item.id === "q1") ?? check.data.answers?.[0];
        const checked: DraftQuestion = { ...candidate, verification: verificationFromAnswer(candidate, answer) };
        best = checked;
        if (checked.verification.status === "agrees" && checked.verification.onTopic !== false) {
            return { question: checked, passed: true, attempts, usage };
        }
        feedback = checkFeedback(checked);
    }

    if (best) return { question: best, passed: false, attempts, usage };
    throw new AiError("bad_output", `The AI could not write a clean replacement${feedback.length ? ` (${feedback.slice(0, 3).join("; ")})` : ""}. Try again.`);
}

/**
 * The context for rewriting a live question: its micro-topic, with the chapter's other
 * micro-topics out of scope. A question that came from a micro-topic pool also keeps that
 * pool's written boundary (covered skills and excluded ideas).
 */
export function liveRewriteContext(concept: MicroConcept, concepts: MicroConcept[], poolConcept: DraftConcept | null = null): RewriteContext {
    const outside = chapterConcepts(concepts, concept.classLevel, concept.topicId)
        .filter((item) => item.microTag !== concept.microTag)
        .map((item) => ({ title: item.title.english, summary: item.concept.english }));
    return {
        level: "micro",
        concept: poolConcept,
        target: {
            classLevel: concept.classLevel as StudentClassLevel,
            chapter: { topicId: concept.topicId, title: concept.topicTitle.english },
            subTopic: concept.subTopic?.english ?? null,
            microTopic: { microTag: concept.microTag, title: concept.title.english },
            microTopics: [{ microTag: concept.microTag, title: concept.title.english, summary: concept.concept.english }],
            outside,
        },
    };
}

/** A live question in the shape the rewrite works with. */
export function asRewriteOriginal(question: QuestionBankItem): RewriteOriginal {
    return {
        difficulty: question.difficulty,
        microTag: question.microTag,
        questionText: question.question.english,
        options: question.options.map((option) => option.english),
        correctOption: question.correctOptionId,
    };
}

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { checkBatchSize, completeJson } from "@/lib/ai-studio/ai";
import { topicSummary, verificationPrompt } from "@/lib/ai-studio/prompts";
import { verificationSchema } from "@/lib/ai-studio/schema";
import {
    assertOpen, clean, draftFrom, draftsCollection, loadDraft,
    studioErrorResponse, toClientDraft,
} from "@/lib/ai-studio/store";
import { OPTION_LETTERS, type DraftQuestion, type OptionLetter } from "@/lib/ai-studio/types";
import { questionFingerprint } from "@/lib/ai-studio/validate";
import { requireSuperAdmin } from "@/lib/server-auth";

export const maxDuration = 300;

/** A check that errored is repeated only when the admin asks ("Check again"), so it cannot loop. */
const needsCheck = (question: DraftQuestion) =>
    question.verification.status === "pending" &&
    question.questionText.trim().length > 0 &&
    question.options.every((option) => option.trim().length > 0);

interface Answer { id: string; chosen_option: string; answer?: string; working: string; on_topic?: boolean; topic_note?: string }

const noteFor = (answer: Answer) => [answer.answer ? `Answer: ${answer.answer}.` : "", answer.working ?? ""].join(" ").trim().slice(0, 600);

/** The scope check: false only when the checker says so, with its reason. */
const topicFields = (answer: Answer) => (answer.on_topic === false
    ? { onTopic: false, topicNote: (answer.topic_note ?? "").trim().slice(0, 300) }
    : { onTopic: true });

/**
 * A second, independent solve: a reasoning model from another service answers a batch of
 * unchecked questions without seeing the marked answer. Any disagreement blocks approval
 * until a person decides.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    try {
        await requireSuperAdmin(request);
        const { id } = await context.params;
        const ref = draftsCollection().doc(id);
        const draft = await loadDraft(id);
        assertOpen(draft);

        const batch = draft.questions.filter(needsCheck).slice(0, checkBatchSize());
        if (!batch.length) {
            return NextResponse.json({ success: true, checked: 0, remaining: 0, draft: toClientDraft(draft) });
        }

        // Short ids keep the reply small and easy to match back. Each question carries its
        // micro-topic, so the checker also says whether the question stays inside it.
        const topics = new Map(draft.target.microTopics.map((topic) => {
            const summary = topicSummary(topic, draft.concept);
            return [topic.microTag, summary ? `${topic.title} (${summary})` : topic.title];
        }));
        const reply = await completeJson<{ answers: Answer[] }>({
            role: "verification",
            ...verificationPrompt(
                batch.map((question, index) => ({ ...question, key: `q${index + 1}`, topic: topics.get(question.microTag) ?? draft.target.chapter.title })),
                draft.level,
            ),
            schemaName: "independent_solve",
            schema: verificationSchema,
            maxOutputTokens: 30_000,
            timeoutMs: 120_000,
            // The check is the safety net for wrong answers, so it thinks harder than the writer.
            reasoningEffort: "high",
        });
        const answers = new Map((reply.data.answers ?? []).map((answer) => [answer.id, answer]));
        const sent = new Map(batch.map((question, index) => [question.key, { fingerprint: questionFingerprint(question), answer: answers.get(`q${index + 1}`) }]));

        const saved = await adminDb.runTransaction(async (transaction) => {
            const latest = draftFrom(await transaction.get(ref));
            assertOpen(latest);
            const questions = latest.questions.map((question): DraftQuestion => {
                const entry = sent.get(question.key);
                // Skip questions deleted, edited or confirmed while the check was running.
                if (!entry || !needsCheck(question) || questionFingerprint(question) !== entry.fingerprint) return question;
                const answer = entry.answer;
                const chosen = answer?.chosen_option;
                // "none": no option equals the checker's answer, so the question itself is broken.
                if (answer && chosen === "none") {
                    return { ...question, verification: { status: "disagrees", aiAnswer: null, note: noteFor(answer), fingerprint: entry.fingerprint, ...topicFields(answer) } };
                }
                if (!answer || !OPTION_LETTERS.includes(chosen as OptionLetter)) {
                    return { ...question, verification: { status: "error", note: "the checker did not answer this question", fingerprint: entry.fingerprint } };
                }
                return {
                    ...question,
                    verification: {
                        status: chosen === question.correctOption ? "agrees" : "disagrees",
                        aiAnswer: chosen as OptionLetter,
                        note: noteFor(answer),
                        fingerprint: entry.fingerprint,
                        ...topicFields(answer),
                    },
                };
            });
            transaction.update(ref, {
                questions: clean(questions),
                "usage.calls": FieldValue.increment(1),
                "usage.inputTokens": FieldValue.increment(reply.usage.inputTokens),
                "usage.outputTokens": FieldValue.increment(reply.usage.outputTokens),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return { ...latest, questions };
        });

        return NextResponse.json({
            success: true,
            checked: batch.length,
            remaining: saved.questions.filter(needsCheck).length,
            draft: toClientDraft(saved),
        });
    } catch (error) {
        return studioErrorResponse(error, "The answers could not be checked");
    }
}

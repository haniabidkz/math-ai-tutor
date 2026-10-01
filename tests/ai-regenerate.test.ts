import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai-studio/ai", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/ai-studio/ai")>()),
    completeJson: vi.fn(),
}));

import { completeJson } from "@/lib/ai-studio/ai";
import { verificationFromAnswer } from "@/lib/ai-studio/check";
import { MICRO_SCOPE_CONSTRAINT, rewritePrompt, scopeRules, verificationPrompt } from "@/lib/ai-studio/prompts";
import { asRewriteOriginal, liveRewriteContext, rewriteQuestion } from "@/lib/ai-studio/regenerate";
import { newestFirst } from "@/lib/question-selection";
import { MICRO_CONCEPTS, getConcept } from "@/lib/curriculum";
import { QUESTION_BANK } from "@/lib/question-bank";
import type { QuestionBankItem } from "@/types/curriculum";
import { reviewDraft } from "./fixtures/ai-draft";

const mocked = vi.mocked(completeJson);
const usage = { inputTokens: 100, outputTokens: 50 };
const reply = (data: unknown) => ({ data, usage, provider: "OpenAI", model: "test", skipped: [] }) as unknown as Awaited<ReturnType<typeof completeJson>>;

/** One model-written question in the JSON shape the writer returns. */
function written(text: string, answer = "A") {
    return {
        questions: [{
            micro_tag: "c6-integers-intro",
            question_text: text,
            options: ["-3", "3", "0", "-6"],
            correct_option: answer,
            hint: { english: "Think of a number line.", roman_urdu: "Number line ka sochein." },
            step_by_step_explanation: { english: "3 below zero is -3.", roman_urdu: "Zero se 3 neeche -3 hai." },
            wrong_option_analysis: ["A", "B", "C", "D"].filter((letter) => letter !== answer).map((option) => ({
                option, english: "That is not 3 below zero.", roman_urdu: "Ye zero se 3 neeche nahin.", misconception_tag: "sign-direction",
            })),
        }],
    };
}
const checker = (chosen: string, onTopic = true) => ({ answers: [{ id: "q1", working: "3 below 0", answer: "-3", chosen_option: chosen, on_topic: onTopic, topic_note: onTopic ? "" : "it is about adding integers" }] });

const draft = reviewDraft({ easy: 2, medium: 0, hard: 0 });
const flagged = draft.questions[0];
const fixedClock = () => 0;

beforeEach(() => mocked.mockReset());

describe("point 1: the owner's micro-topic constraint", () => {
    it("is sent word for word with every micro-topic request, and the checker rejects broader questions", () => {
        expect(MICRO_SCOPE_CONSTRAINT).toBe("Generate questions strictly for the selected micro-topic. Do not add broader main-topic or sub-topic questions. Keep questions completely bound to the micro-topic.");
        expect(scopeRules(draft)).toContain(MICRO_SCOPE_CONSTRAINT);
        expect(rewritePrompt(draft, { original: flagged, reason: "off_topic", avoid: [] }).user).toContain(MICRO_SCOPE_CONSTRAINT);
        expect(verificationPrompt([{ ...flagged, topic: "Introduction to Integers" }], "micro").user)
            .toContain("is a broader sub-topic or main-topic question rather than one about this micro-topic");
    });
});

describe("point 4: regenerate one question", () => {
    it("asks for a replacement that fixes the flagged problem and never copies the question", () => {
        const prompt = rewritePrompt(draft, { original: flagged, reason: "wrong", note: "the answer should be 5", avoid: [flagged.questionText] }).user;
        expect(prompt).toContain("REWRITE ONE QUESTION (strict)");
        expect(prompt).toContain("The marked answer is wrong, or no option is correct.");
        expect(prompt).toContain('The Super Admin adds: "the answer should be 5"');
        expect(prompt).toContain(`Question: ${flagged.questionText}`);
        expect(prompt).toContain("Write exactly 1 new EASY question");
        expect(prompt).toContain("Write exactly 1 EASY questions.");
        expect(prompt).toContain(`- ${flagged.questionText}`);
    });

    it("redoes a reply that breaks a rule, then returns the version the checker agrees with", async () => {
        const long = `${"Ali walks along a very long road near the busy bazaar ".repeat(5)}and ends 3 below zero. Where is he?`;
        mocked
            .mockResolvedValueOnce(reply(written(long)))
            .mockResolvedValueOnce(reply(written("Which integer is 3 steps below zero on a number line?")))
            .mockResolvedValueOnce(reply(checker("A")));

        const outcome = await rewriteQuestion({ context: draft, original: flagged, reason: "flawed", avoid: [] }, fixedClock);

        expect(outcome.passed).toBe(true);
        expect(outcome.attempts).toBe(2);
        expect(outcome.question.questionText).toBe("Which integer is 3 steps below zero on a number line?");
        expect(outcome.question.verification).toMatchObject({ status: "agrees", aiAnswer: "A", onTopic: true });
        expect(outcome.usage.calls).toBe(3);
        // The second request carried the reason the first was rejected.
        expect(mocked.mock.calls[1][0].user).toMatch(/Too long \(\d+ words\)/);
        expect(mocked.mock.calls[2][0].role).toBe("verification");
    });

    it("never accepts the flagged question back", async () => {
        mocked
            .mockResolvedValueOnce(reply(written(flagged.questionText)))
            .mockResolvedValueOnce(reply(written("Which integer is 3 steps below zero on a number line?")))
            .mockResolvedValueOnce(reply(checker("A")));
        const outcome = await rewriteQuestion({ context: draft, original: flagged, reason: "flawed", avoid: [] }, fixedClock);
        expect(mocked.mock.calls[1][0].user).toContain("it repeats an existing question");
        expect(outcome.passed).toBe(true);
    });

    it("tries again when the checker disagrees or finds it off topic, and reports a version that never passed", async () => {
        mocked
            .mockResolvedValueOnce(reply(written("Which integer is 3 steps below zero on a number line?", "B")))
            .mockResolvedValueOnce(reply(checker("A")))
            .mockResolvedValueOnce(reply(written("Which number is 3 places left of zero on a number line?")))
            .mockResolvedValueOnce(reply(checker("A", false)))
            .mockResolvedValueOnce(reply(written("On a number line, what is 3 units below 0?")))
            .mockResolvedValueOnce(reply(checker("none")));

        const outcome = await rewriteQuestion({ context: draft, original: flagged, reason: "wrong", avoid: [] }, fixedClock);

        expect(outcome.passed).toBe(false);
        expect(outcome.attempts).toBe(3);
        expect(mocked.mock.calls[2][0].user).toContain("an independent solve chose option A, not B");
        expect(mocked.mock.calls[4][0].user).toContain("it went outside the micro-topic: it is about adding integers");
        expect(outcome.question.verification).toMatchObject({ status: "disagrees", aiAnswer: null });
    });

    it("rewrites a live question inside its own micro-topic, with the chapter's other lessons out of scope", () => {
        const concept = getConcept("c6-negative-numbers")!;
        const context = liveRewriteContext(concept, MICRO_CONCEPTS);
        expect(context.level).toBe("micro");
        expect(context.target.microTopics).toEqual([expect.objectContaining({ microTag: "c6-negative-numbers", title: "Negative Numbers" })]);
        expect(context.target.outside?.map((topic) => topic.title)).toContain("Basic Integer Addition");
        expect(context.target.outside?.map((topic) => topic.title)).not.toContain("Negative Numbers");
        const live = QUESTION_BANK.find((question) => question.microTag === "c6-negative-numbers")!;
        expect(asRewriteOriginal(live)).toMatchObject({ microTag: "c6-negative-numbers", questionText: live.question.english, correctOption: live.correctOptionId });
    });

    it("records the checker's verdict the same way the pool check does", () => {
        const question = { questionText: "q", options: ["1", "2", "3", "4"], correctOption: "B" as const };
        expect(verificationFromAnswer(question, { id: "q1", chosen_option: "B", working: "w", on_topic: true })).toMatchObject({ status: "agrees", aiAnswer: "B", onTopic: true });
        expect(verificationFromAnswer(question, { id: "q1", chosen_option: "C", working: "w" })).toMatchObject({ status: "disagrees", aiAnswer: "C" });
        expect(verificationFromAnswer(question, undefined)).toMatchObject({ status: "error" });
    });
});

describe("point 2: approved content reaches students first", () => {
    it("serves the newest questions of a lesson first", () => {
        const at = (millis: number) => ({ toMillis: () => millis });
        const old = { ...QUESTION_BANK[0], id: "c6-integers-intro-01" } as QuestionBankItem;
        const approved = { ...QUESTION_BANK[1], id: "c6-integers-intro-ai-b", createdAt: at(2_000) } as QuestionBankItem;
        const approvedToo = { ...QUESTION_BANK[2], id: "c6-integers-intro-ai-a", createdAt: at(2_000) } as QuestionBankItem;
        const earlier = { ...QUESTION_BANK[3], id: "c6-integers-intro-x", createdAt: at(1_000) } as QuestionBankItem;
        expect(newestFirst([old, earlier, approved, approvedToo]).map((question) => question.id))
            .toEqual(["c6-integers-intro-ai-a", "c6-integers-intro-ai-b", "c6-integers-intro-x", "c6-integers-intro-01"]);
    });
});

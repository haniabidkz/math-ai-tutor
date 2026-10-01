import { OPTION_LETTERS, type DraftQuestion, type OptionLetter } from "@/lib/ai-studio/types";
import { questionFingerprint } from "@/lib/ai-studio/validate";

/** One answer from the independent checker (see verificationSchema). */
export interface CheckerAnswer {
    id: string;
    chosen_option: string;
    answer?: string;
    working: string;
    on_topic?: boolean;
    topic_note?: string;
}

const noteFor = (answer: CheckerAnswer) => [answer.answer ? `Answer: ${answer.answer}.` : "", answer.working ?? ""].join(" ").trim().slice(0, 600);

/** The scope check: false only when the checker says so, with its reason. */
const topicFields = (answer: CheckerAnswer) => (answer.on_topic === false
    ? { onTopic: false, topicNote: (answer.topic_note ?? "").trim().slice(0, 300) }
    : { onTopic: true });

/** Turns the checker's answer for one question into its verification record. */
export function verificationFromAnswer(
    question: Pick<DraftQuestion, "questionText" | "options" | "correctOption">,
    answer: CheckerAnswer | undefined,
    fingerprint = questionFingerprint(question),
): DraftQuestion["verification"] {
    const chosen = answer?.chosen_option;
    // "none": no option equals the checker's answer, so the question itself is broken.
    if (answer && chosen === "none") {
        return { status: "disagrees", aiAnswer: null, note: noteFor(answer), fingerprint, ...topicFields(answer) };
    }
    if (!answer || !OPTION_LETTERS.includes(chosen as OptionLetter)) {
        return { status: "error", note: "the checker did not answer this question", fingerprint };
    }
    return {
        status: chosen === question.correctOption ? "agrees" : "disagrees",
        aiAnswer: chosen as OptionLetter,
        note: noteFor(answer),
        fingerprint,
        ...topicFields(answer),
    };
}

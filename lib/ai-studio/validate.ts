import { findForeignContext } from "@/lib/ai-studio/context-check";
import { DIFFICULTIES } from "@/lib/ai-studio/quotas";
import { OPTION_LETTERS, type DraftQuestion, type GenerationDraft } from "@/lib/ai-studio/types";
import { MISCONCEPTIONS } from "@/lib/mistake-analysis";

export interface DraftIssue {
    severity: "error" | "warning";
    /** A question key, "concept", or "draft" for whole-draft problems. */
    where: string;
    message: string;
}

const filled = (value: string | undefined | null) => typeof value === "string" && value.trim().length > 0;
export const normalizeText = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** A stable fingerprint of what a solver sees, so any edit invalidates an earlier check. */
export function questionFingerprint(question: Pick<DraftQuestion, "questionText" | "options" | "correctOption">): string {
    return JSON.stringify([normalizeText(question.questionText), question.options.map(normalizeText), question.correctOption]);
}

export function questionIssues(question: DraftQuestion, allowedTags: Set<string>): DraftIssue[] {
    const issues: DraftIssue[] = [];
    const add = (message: string, severity: DraftIssue["severity"] = "error") => issues.push({ severity, where: question.key, message });

    if (!filled(question.questionText)) add("The question text is empty.");
    if (question.options.length !== 4) add("A question needs exactly 4 options.");
    if (question.options.some((option) => !filled(option))) add("Every option needs text.");
    if (new Set(question.options.map(normalizeText)).size !== question.options.length) add("Two options are the same.");
    if (!OPTION_LETTERS.includes(question.correctOption)) add("Choose the correct option.");
    if (!allowedTags.has(question.microTag)) add("Choose which micro-topic this question belongs to.");

    if (!filled(question.hint.english) || !filled(question.hint.romanUrdu)) add("The hint is needed in both English and Roman Urdu.");
    if (!filled(question.solution.english) || !filled(question.solution.romanUrdu)) add("The step-by-step solution is needed in both English and Roman Urdu.");

    for (const letter of OPTION_LETTERS) {
        if (letter === question.correctOption) continue;
        const reason = question.wrongReasons[letter];
        if (!reason || !filled(reason.english) || !filled(reason.romanUrdu)) {
            add(`Option ${letter} needs a reason why it is wrong, in both English and Roman Urdu.`);
        } else if (!MISCONCEPTIONS[reason.misconceptionTag]) {
            add(`Option ${letter} needs a misconception tag.`);
        }
    }

    const foreign = findForeignContext(question.questionText, ...question.options, question.hint.english, question.solution.english);
    if (foreign.length) add(`Uses a foreign setting (${foreign.join(", ")}). Rewrite it with a local example.`);

    const verification = question.verification;
    if (verification.status === "pending") add("Not checked yet: the answer has not been solved independently.");
    else if (verification.status === "error") add(`The independent check failed: ${verification.note ?? "try again"}.`);
    else if (verification.status === "disagrees") {
        add(`The independent solve chose ${verification.aiAnswer ?? "a different option"}, but ${question.correctOption} is marked correct. Check the math, or confirm it if you are sure.`);
    } else if (verification.fingerprint && verification.fingerprint !== questionFingerprint(question)) {
        add("The question changed after it was checked. Check it again.");
    }
    return issues;
}

/**
 * Everything that must be true before a draft can go live: exact counts per difficulty,
 * complete bilingual content, reasons for every wrong option, local settings, no repeats,
 * and an independent check of every answer.
 */
export function validateDraft(draft: Pick<GenerationDraft, "quota" | "concept" | "questions" | "target">, existingQuestionTexts: Set<string> = new Set()): DraftIssue[] {
    const issues: DraftIssue[] = [];
    const allowedTags = new Set(draft.target.microTopics.map((topic) => topic.microTag));

    // Exact per-difficulty counts also fix the total, so the total needs no check of its own.
    for (const difficulty of DIFFICULTIES) {
        const have = draft.questions.filter((question) => question.difficulty === difficulty).length;
        const want = draft.quota[difficulty];
        if (have !== want) issues.push({ severity: "error", where: "draft", message: `${difficulty[0].toUpperCase()}${difficulty.slice(1)}: ${have} of ${want} questions.` });
    }

    const concept = draft.concept;
    if (!concept) {
        issues.push({ severity: "error", where: "concept", message: "The concept explanation has not been written yet." });
    } else {
        if (!filled(concept.title)) issues.push({ severity: "error", where: "concept", message: "The concept needs a title." });
        if (!filled(concept.explanation.english) || !filled(concept.explanation.romanUrdu)) {
            issues.push({ severity: "error", where: "concept", message: "The explanation is needed in both English and Roman Urdu." });
        }
        if (!filled(concept.example.english) || !filled(concept.example.romanUrdu)) {
            issues.push({ severity: "error", where: "concept", message: "The real-life example is needed in both English and Roman Urdu." });
        }
        const foreign = findForeignContext(concept.explanation.english, concept.example.english);
        if (foreign.length) issues.push({ severity: "error", where: "concept", message: `Uses a foreign setting (${foreign.join(", ")}). Rewrite it with a local example.` });
    }

    const seen = new Map<string, string>();
    for (const question of draft.questions) {
        issues.push(...questionIssues(question, allowedTags));
        const text = normalizeText(question.questionText);
        if (!text) continue;
        if (seen.has(text)) issues.push({ severity: "error", where: question.key, message: "This question repeats another one in the pool." });
        else seen.set(text, question.key);
        if (existingQuestionTexts.has(text)) issues.push({ severity: "error", where: question.key, message: "This question is already in the live question bank." });
    }
    return issues;
}

export function blockingIssues(issues: DraftIssue[]): DraftIssue[] {
    return issues.filter((issue) => issue.severity === "error");
}

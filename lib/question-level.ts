import type { QuestionBankItem } from "@/types/curriculum";

/**
 * Which pool a question was written for. Only micro-topic questions teach: they carry a hint,
 * a worked solution and a reason for every wrong option. Sub-topic and main-topic questions
 * only mark right or wrong. Pure, so screens and tests can use it without the database.
 */

export type QuestionLevel = NonNullable<QuestionBankItem["level"]>;

/** Questions from before November 2026 have no level and are micro-topic questions. */
export const questionLevel = (question: Pick<QuestionBankItem, "level">): QuestionLevel => question.level ?? "micro";

/** True when the question explains itself: hint, worked solution and why each wrong option is wrong. */
export const questionExplains = (question: Pick<QuestionBankItem, "level">): boolean => questionLevel(question) === "micro";

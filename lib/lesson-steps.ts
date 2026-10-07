import { getOptionAnalysis } from "@/lib/mistake-analysis";
import { cleanMathText } from "@/lib/text-clean";
import type { Difficulty, LocalizedOption, LocalizedText, QuestionBankItem } from "@/types/curriculum";

export type OptionId = LocalizedOption["id"];

/** A practice question for the lesson screen: answered on the device, never scored. */
export interface LessonPracticeItem {
    id: string;
    difficulty: Difficulty;
    question: LocalizedText;
    options: LocalizedOption[];
    correctOptionId: OptionId;
    hint: LocalizedText;
    explanation: LocalizedText;
    /** Why each wrong option is wrong, in the question's own words. */
    whyWrong: Partial<Record<OptionId, LocalizedText>>;
}

/** The five screens of a lesson, in order. */
export const LESSON_STEPS = [
    { key: "idea", english: "Big idea", romanUrdu: "Big idea" },
    { key: "see", english: "See it", romanUrdu: "Dekho" },
    { key: "do", english: "Try it", romanUrdu: "Khud karo" },
    { key: "mistake", english: "Common mistake", romanUrdu: "Aam ghalti" },
    { key: "check", english: "Quick check", romanUrdu: "Quick check" },
] as const;

export type LessonStepKey = (typeof LESSON_STEPS)[number]["key"];

const MAX_IDEA_LENGTH = 180;

function firstSentence(text: string): string {
    const clean = text.replace(/\s+/g, " ").trim();
    const match = clean.match(/^.+?[.!?](?=\s|$)/);
    const sentence = (match ? match[0] : clean).trim();
    if (sentence.length <= MAX_IDEA_LENGTH) return sentence;
    const cut = sentence.lastIndexOf(" ", MAX_IDEA_LENGTH);
    return `${sentence.slice(0, cut > 60 ? cut : MAX_IDEA_LENGTH).trim()}…`;
}

/** The first sentence of the explanation in each language: the one line the lesson is about. */
export function keyIdea(text: LocalizedText): LocalizedText {
    return { english: firstSentence(text.english), romanUrdu: firstSentence(text.romanUrdu || text.english) };
}

/** The lesson markdown without its leading heading, which the screen already shows as the title. */
export function withoutHeading(markdown: string): string {
    return markdown.replace(/^\s*#{1,6}\s[^\n]*\n+/, "").trim();
}

const localizedClean = (text: LocalizedText): LocalizedText => ({ english: cleanMathText(text.english), romanUrdu: cleanMathText(text.romanUrdu) });

/** Shapes a bank question for the lesson, with the answer and the reason behind every wrong option. */
export function toPracticeItem(question: QuestionBankItem): LessonPracticeItem {
    const whyWrong: Partial<Record<OptionId, LocalizedText>> = {};
    for (const option of question.options) {
        const analysis = getOptionAnalysis(question, option.id);
        if (analysis) whyWrong[option.id] = analysis.whyWrong;
    }
    return {
        id: question.id,
        difficulty: question.difficulty,
        question: localizedClean(question.question),
        options: question.options.map((option) => ({ id: option.id, english: cleanMathText(option.english), romanUrdu: cleanMathText(option.romanUrdu) })),
        correctOptionId: question.correctOptionId,
        hint: question.hint,
        explanation: question.explanation,
        whyWrong,
    };
}

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];

/**
 * Up to `count` practice questions, easiest first, in a fresh order on every visit. A lesson
 * with no questions yet gives none, and the screen says so instead of failing.
 */
export function pickPractice(questions: QuestionBankItem[], count = 2, random: () => number = Math.random): LessonPracticeItem[] {
    const chosen: QuestionBankItem[] = [];
    for (const level of LEVELS) {
        const pool = questions.filter((question) => question.difficulty === level && !chosen.includes(question));
        for (let index = pool.length - 1; index > 0; index--) {
            const swap = Math.floor(random() * (index + 1));
            [pool[index], pool[swap]] = [pool[swap], pool[index]];
        }
        for (const question of pool) {
            if (chosen.length >= count) break;
            chosen.push(question);
        }
        if (chosen.length >= count) break;
    }
    return chosen.map(toPracticeItem);
}

export interface CommonMistake {
    right: LocalizedOption;
    wrong: LocalizedOption;
    reason: LocalizedText;
}

/** The right answer beside one wrong option with its reason, for the common-mistake step. */
export function commonMistake(item: LessonPracticeItem | undefined): CommonMistake | null {
    if (!item) return null;
    const right = item.options.find((option) => option.id === item.correctOptionId);
    const wrong = item.options.find((option) => option.id !== item.correctOptionId && item.whyWrong[option.id]);
    if (!right || !wrong) return null;
    return { right, wrong, reason: item.whyWrong[wrong.id]! };
}

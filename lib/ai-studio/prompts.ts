import { MISCONCEPTIONS, MISCONCEPTION_TAGS } from "@/lib/mistake-analysis";
import { CURRICULUM_NAME, type DraftQuestion, type GenerationDraft, type GenerationLevel } from "@/lib/ai-studio/types";
import type { Difficulty } from "@/types/curriculum";

/**
 * Rule A lives here: very simple English, warm everyday Roman Urdu, and settings from
 * Pakistani daily life. The code checks in validate.ts catch what the model still gets wrong.
 */
const STYLE_RULES = `
LANGUAGE
- English: very simple, Grade 6 vocabulary, short sentences. No difficult words.
- Roman Urdu: warm and conversational, the way a friendly Pakistani teacher talks ("Aao dekhte hain...", "Chalo milkar hal karte hain"). Urdu written in English letters, never Urdu script.

LOCAL CONTEXT (strict)
- Real-life settings must come from everyday Pakistani life: the local bazaar, a school tuck shop, cricket matches, sharing roti or mangoes at home, buses and rickshaws, Eid, school trips.
- Money is always Rupees (Rs.). Distance in metres and kilometres. Weight in grams and kilograms. Temperature in Celsius.
- Never use dollars, pounds, euros, miles, gallons, Fahrenheit, American sports or foreign holidays.
- Use common Pakistani names (Ali, Sara, Ahmed, Ayesha, Bilal, Fatima, Hamza, Zainab).

MATH
- Work every calculation out carefully and double-check it before answering. The marked answer must be exactly right.
- Each question has exactly one correct option. The other three options must be believable mistakes a student really makes.`.trim();

const DIFFICULTY_RULES: Record<Difficulty, string> = {
    easy: "EASY: direct, one-step questions in the style of the Sindh Textbook Board, using clear definitions.",
    medium: "MEDIUM: conceptual questions that apply the idea in an unfamiliar way, Oxford Countdown style.",
    hard: "HARD: analytical, multi-step reasoning questions, like the harder Oxford Countdown exercises.",
};

const LEVEL_WORDS: Record<GenerationLevel, string> = {
    micro: "micro-topic",
    sub: "sub-topic checkpoint",
    main: "main-topic mastery pool",
};

function scope(draft: Pick<GenerationDraft, "level" | "target">): string {
    const { target } = draft;
    return [
        `Curriculum: ${CURRICULUM_NAME}`,
        `Class: ${target.classLevel}`,
        `Main topic (chapter): ${target.chapter.title}`,
        target.subTopic ? `Sub-topic: ${target.subTopic}` : null,
        target.microTopic ? `Micro-topic: ${target.microTopic.title}` : null,
        `Level: ${LEVEL_WORDS[draft.level]}`,
    ].filter(Boolean).join("\n");
}

export function conceptPrompt(draft: Pick<GenerationDraft, "level" | "target">) {
    return {
        system: `You write math lessons for Pakistani middle-school students.\n\n${STYLE_RULES}`,
        user: `${scope(draft)}

Write the concept explanation for this ${LEVEL_WORDS[draft.level]}:
- title: a short title.
- english: a very simple explanation in 3 to 5 short sentences, with one tiny worked example.
- roman_urdu: the same explanation in warm, conversational Roman Urdu.
- real_life_example: one relatable local word problem from Pakistani daily life, in English and in Roman Urdu.`,
    };
}

const TAG_GUIDE = MISCONCEPTION_TAGS.map((tag) => `- ${tag}: ${MISCONCEPTIONS[tag].label.english}. ${MISCONCEPTIONS[tag].whyWrong.english}`).join("\n");

export function questionPrompt(
    draft: Pick<GenerationDraft, "level" | "target">,
    request: { difficulty: Difficulty; count: number; avoid: string[]; feedback?: string[] },
) {
    const topics = draft.target.microTopics.map((topic) => `- ${topic.microTag}: ${topic.title}`).join("\n");
    const spread = draft.target.microTopics.length > 1
        ? "Spread the questions across the micro-topics below and set micro_tag to the one each question tests."
        : "Set micro_tag to the micro-topic below for every question.";
    const avoid = request.avoid.length
        ? `\nThese questions already exist. Do not repeat them or make near-copies:\n${request.avoid.slice(-60).map((item) => `- ${item.slice(0, 140)}`).join("\n")}`
        : "";
    const feedback = request.feedback?.length
        ? `\nYour previous attempt was rejected for these reasons. Fix every one:\n${request.feedback.map((item) => `- ${item}`).join("\n")}`
        : "";

    return {
        system: `You write multiple-choice math questions for Pakistani middle-school students.\n\n${STYLE_RULES}`,
        user: `${scope(draft)}

Write exactly ${request.count} ${request.difficulty.toUpperCase()} questions.
${DIFFICULTY_RULES[request.difficulty]}

${spread}
${topics}

For every question:
- question_text: the question in simple English.
- options: exactly 4 different answers, in order A, B, C, D. Write only the answer itself; never start an option with its letter (write "-3", not "A. -3").
- correct_option: the letter of the one correct answer.
- hint: a helpful nudge that does not give the answer away, in English and in Roman Urdu.
- step_by_step_explanation: the full worked solution, step by step, in English and in Roman Urdu.
- wrong_option_analysis: one entry for each of the 3 wrong options (never the correct one), explaining simply why it is wrong, in English and in Roman Urdu, with the misconception_tag that best describes the mistake:
${TAG_GUIDE}

Before you finish, solve every question again from the start. Exactly one option must equal your answer, and no two options may be equal. If a question fails this check, rewrite its numbers or options until it passes; never hand in a question whose solution says no option is correct.
${avoid}${feedback}`,
    };
}

export function verificationPrompt(questions: Array<Pick<DraftQuestion, "key" | "questionText" | "options">>) {
    const listing = questions.map((question) => [
        `id: ${question.key}`,
        `question: ${question.questionText}`,
        ...question.options.map((option, index) => `${"ABCD"[index]}) ${option}`),
    ].join("\n")).join("\n\n");
    return {
        system: "You are a careful math examiner. Solve each multiple-choice question yourself from scratch before looking at the options, then pick the option that equals your answer. Do not guess, and never pick an option just because it is the closest.",
        user: `Solve every question below independently. For each, give the id, one or two lines of working, your final answer, and the letter of the option that equals it. If no option equals your answer, or two options are the same answer, choose "none".\n\n${listing}`,
    };
}

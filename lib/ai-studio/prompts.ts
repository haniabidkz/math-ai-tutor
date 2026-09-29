import { MISCONCEPTIONS, MISCONCEPTION_TAGS } from "@/lib/mistake-analysis";
import { CURRICULUM_NAME, NEW_MICRO_TAG, type DraftConcept, type DraftQuestion, type GenerationDraft, type GenerationLevel } from "@/lib/ai-studio/types";
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

SHORT AND QUICK (strict)
- Each question checks one core idea or one piece of logical thinking, not reading or long arithmetic.
- question_text is one or two short sentences, at most 30 words. Options are short answers: a number, a word or a short phrase.
- Use small, clean numbers: mostly whole numbers under 100, and simple fractions or decimals only when the topic is about them. A student should answer in under a minute.
- No long lists, no stacked conditions, no data tables. Hints are one sentence, worked solutions 2 to 4 short steps, and each wrong-option reason one short sentence.

MATH
- Work every calculation out carefully and double-check it before answering. The marked answer must be exactly right.
- Each question has exactly one correct option. The other three options must be believable mistakes a student really makes.`.trim();

const DIFFICULTY_RULES: Record<Difficulty, string> = {
    easy: "EASY: one step. Recall the idea or apply it directly, in the style of the Sindh Textbook Board.",
    medium: "MEDIUM: apply the idea in a slightly new way or spot a common mistake, in at most two quick steps, Oxford Countdown style.",
    hard: "HARD: needs real understanding (reason about why, compare, find the error or choose a method) in at most two or three quick steps. Make it hard through thinking, never through length, extra conditions or big numbers.",
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

type TopicInfo = GenerationDraft["target"]["microTopics"][number];

/** What a micro-topic covers; a new micro-topic is described by its freshly written explanation. */
export function topicSummary(topic: TopicInfo, concept?: DraftConcept | null): string {
    if (topic.summary) return topic.summary;
    if (topic.microTag === NEW_MICRO_TAG && concept?.explanation.english) return concept.explanation.english;
    return "";
}

const topicLine = (topic: TopicInfo, concept?: DraftConcept | null) => {
    const summary = topicSummary(topic, concept);
    return `- ${topic.microTag}: ${topic.title}${summary ? ` (${summary})` : ""}`;
};

/**
 * Keeps questions inside what was asked for: one micro-topic stays on that micro-topic, a
 * sub-topic stays inside its micro-topics, and a main topic covers the chapter's core ideas.
 */
export function scopeRules(draft: Pick<GenerationDraft, "level" | "target">, concept?: DraftConcept | null): string {
    const { target } = draft;
    const topics = target.microTopics.map((topic) => topicLine(topic, concept)).join("\n");
    if (draft.level === "micro") {
        const topic = target.microTopics[0];
        const summary = topicSummary(topic, concept);
        return `STRICT SCOPE: this micro-topic only
Every question must test "${topic.title}" and nothing else${summary ? `: ${summary}` : "."}
Do not ask about other ideas from ${target.subTopic ? `the sub-topic "${target.subTopic}" or ` : ""}the main topic "${target.chapter.title}", even closely related ones. Leave out any question that needs a skill from another part of the chapter.`;
    }
    if (draft.level === "sub") {
        return `STRICT SCOPE: the sub-topic "${target.subTopic}" only
Every question must stay inside this sub-topic, which is made of these micro-topics:
${topics}
Do not ask about other parts of the main topic "${target.chapter.title}".`;
    }
    return `SCOPE: the main topic "${target.chapter.title}"
Cover the core concepts of this main topic, spread across its micro-topics:
${topics}
Focus on the central ideas every student must know, not side details.`;
}

/**
 * For sub-topic and main-topic pools, which micro-topics the next batch should cover: those
 * with the fewest questions so far, so the pool ends up evenly spread.
 */
export function batchFocus(draft: Pick<GenerationDraft, "level" | "target" | "questions">, count: number): string[] {
    const topics = draft.target.microTopics;
    if (draft.level === "micro" || topics.length <= 1) return [];
    const used = new Map(topics.map((topic) => [topic.microTag, 0]));
    for (const question of draft.questions) used.set(question.microTag, (used.get(question.microTag) ?? 0) + 1);
    const ordered = topics
        .map((topic, index) => ({ tag: topic.microTag, used: used.get(topic.microTag) ?? 0, index }))
        .sort((left, right) => left.used - right.used || left.index - right.index)
        .map((item) => item.tag);
    return Array.from({ length: count }, (_, position) => ordered[position % ordered.length]);
}

export function conceptPrompt(draft: Pick<GenerationDraft, "level" | "target">) {
    const only = draft.level === "micro" && draft.target.microTopic
        ? `\nExplain only "${draft.target.microTopic.title}". Do not teach other parts of the chapter.`
        : "";
    return {
        system: `You write math lessons for Pakistani middle-school students.\n\n${STYLE_RULES}`,
        user: `${scope(draft)}
${only}
Write the concept explanation for this ${LEVEL_WORDS[draft.level]}:
- title: a short title.
- english: a very simple explanation in 3 to 5 short sentences, with one tiny worked example.
- roman_urdu: the same explanation in warm, conversational Roman Urdu.
- real_life_example: one short, relatable local word problem from Pakistani daily life, in English and in Roman Urdu.`,
    };
}

const TAG_GUIDE = MISCONCEPTION_TAGS.map((tag) => `- ${tag}: ${MISCONCEPTIONS[tag].label.english}. ${MISCONCEPTIONS[tag].whyWrong.english}`).join("\n");

/** Existing questions sent to the model to avoid; recent ones matter most. */
const AVOID_LIMIT = 150;

export function questionPrompt(
    draft: Pick<GenerationDraft, "level" | "target" | "concept">,
    request: { difficulty: Difficulty; count: number; avoid: string[]; feedback?: string[]; focus?: string[] },
) {
    const tags = draft.target.microTopics.map((topic) => topic.microTag);
    const placement = request.focus?.length
        ? `In this batch write one question for each of these micro-topics, in this order, and set micro_tag to match: ${request.focus.join(", ")}.`
        : `Set micro_tag to ${tags[0]} for every question.`;
    const avoid = request.avoid.length
        ? `\n\nNO REPEATS (strict)
These questions already exist. Every new question must differ from all of them in its idea or situation and in its numbers. Changing only names or numbers is not enough.
${request.avoid.slice(-AVOID_LIMIT).map((item) => `- ${item.slice(0, 160)}`).join("\n")}`
        : "";
    const feedback = request.feedback?.length
        ? `\n\nYour previous attempt was rejected for these reasons. Fix every one:\n${request.feedback.map((item) => `- ${item}`).join("\n")}`
        : "";

    return {
        system: `You write multiple-choice math questions for Pakistani middle-school students.\n\n${STYLE_RULES}`,
        user: `${scope(draft)}

${scopeRules(draft, draft.concept)}

Write exactly ${request.count} ${request.difficulty.toUpperCase()} questions.
${DIFFICULTY_RULES[request.difficulty]}
${placement}
Within this batch, no two questions may test the same thing in the same way or reuse the same numbers.

For every question:
- question_text: the question in simple English, at most 30 words.
- options: exactly 4 different short answers, in order A, B, C, D. Write only the answer itself; never start an option with its letter (write "-3", not "A. -3").
- correct_option: the letter of the one correct answer.
- hint: a one-sentence nudge that does not give the answer away, in English and in Roman Urdu.
- step_by_step_explanation: the worked solution in 2 to 4 short steps, in English and in Roman Urdu.
- wrong_option_analysis: one entry for each of the 3 wrong options (never the correct one), one short sentence on why it is wrong, in English and in Roman Urdu, with the misconception_tag that best describes the mistake:
${TAG_GUIDE}

Before you finish, solve every question again from the start. Exactly one option must equal your answer, and no two options may be equal. If a question fails this check, rewrite its numbers or options until it passes; never hand in a question whose solution says no option is correct.${avoid}${feedback}`,
    };
}

export function verificationPrompt(
    questions: Array<Pick<DraftQuestion, "key" | "questionText" | "options"> & { topic: string }>,
    level: GenerationLevel = "micro",
) {
    const listing = questions.map((question) => [
        `id: ${question.key}`,
        `topic: ${question.topic}`,
        `question: ${question.questionText}`,
        ...question.options.map((option, index) => `${"ABCD"[index]}) ${option}`),
    ].join("\n")).join("\n\n");
    const strictness = level === "micro"
        ? "Each question must test only its topic; mark on_topic false if it mainly needs another part of the chapter."
        : "Mark on_topic false only if the question does not belong to its topic at all.";
    return {
        system: "You are a careful math examiner. Solve each multiple-choice question yourself from scratch before looking at the options, then pick the option that equals your answer. Do not guess, and never pick an option just because it is the closest.",
        user: `Solve every question below independently. For each, give the id, one or two lines of working, your final answer, and the letter of the option that equals it. If no option equals your answer, or two options are the same answer, choose "none".
Also say whether the question tests its stated topic. ${strictness} If it is off topic, say why in topic_note in one short sentence; otherwise leave topic_note empty.

${listing}`,
    };
}

import { MISCONCEPTIONS, MISCONCEPTION_TAGS } from "@/lib/mistake-analysis";
import {
    CURRICULUM_NAME, NEW_MICRO_TAG, REWRITE_REASONS,
    type DraftConcept, type DraftQuestion, type GenerationDraft, type GenerationLevel, type RewriteReason,
} from "@/lib/ai-studio/types";
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

/** The owner's own wording for a micro-topic pool, sent word for word with every micro-topic request. */
export const MICRO_SCOPE_CONSTRAINT = "Generate questions strictly for the selected micro-topic. Do not add broader main-topic or sub-topic questions. Keep questions completely bound to the micro-topic.";

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

/** Other micro-topics of the chapter and the model's own list of neighbouring ideas: all out of scope. */
function outOfScope(draft: Pick<GenerationDraft, "target">, concept?: DraftConcept | null): string[] {
    return [
        ...(draft.target.outside ?? []).map((topic) => `${topic.title} (another lesson of this chapter)`),
        ...(concept?.scope?.excludes ?? []),
    ];
}

/** The written boundary, when the explanation step has produced one. */
function boundary(draft: Pick<GenerationDraft, "target">, concept?: DraftConcept | null): string {
    const covers = concept?.scope?.covers ?? [];
    const excluded = outOfScope(draft, concept);
    return [
        covers.length ? `IN SCOPE: only these skills.\n${covers.map((skill) => `- ${skill}`).join("\n")}` : "",
        excluded.length ? `OUT OF SCOPE: never ask about these, not even as one step of a question.\n${excluded.map((item) => `- ${item}`).join("\n")}` : "",
    ].filter(Boolean).join("\n");
}

/**
 * Keeps questions inside what was asked for: one micro-topic stays on that micro-topic, a
 * sub-topic stays inside its micro-topics, and a main topic covers the chapter's core ideas.
 */
export function scopeRules(draft: Pick<GenerationDraft, "level" | "target">, concept?: DraftConcept | null): string {
    const { target } = draft;
    const topics = target.microTopics.map((topic) => topicLine(topic, concept)).join("\n");
    const limits = boundary(draft, concept);
    if (draft.level === "micro") {
        const topic = target.microTopics[0];
        const summary = topicSummary(topic, concept);
        return `STRICT SCOPE: this micro-topic only
${MICRO_SCOPE_CONSTRAINT}
Every question must test "${topic.title}" and nothing else${summary ? `: ${summary}` : "."}
Do not ask about other ideas from ${target.subTopic ? `the sub-topic "${target.subTopic}" or ` : ""}the main topic "${target.chapter.title}", even closely related ones. Leave out any question that needs a skill from another part of the chapter. A narrow topic is fine: vary the situations and the kind of thinking, never the topic.${limits ? `\n${limits}` : ""}`;
    }
    if (draft.level === "sub") {
        return `STRICT SCOPE: the sub-topic "${target.subTopic}" only
Every question must stay inside this sub-topic, which is made of these micro-topics:
${topics}
Do not ask about other parts of the main topic "${target.chapter.title}".${limits ? `\n${limits}` : ""}`;
    }
    return `SCOPE: the main topic "${target.chapter.title}"
Cover the core concepts of this main topic, spread across its micro-topics:
${topics}
Focus on the central ideas every student must know, not side details.${limits ? `\n${limits}` : ""}`;
}

/** How the checker sees a question's topic: title, summary and the written boundary. */
export function checkerTopic(draft: Pick<GenerationDraft, "target" | "concept">, microTag: string): string {
    const topic = draft.target.microTopics.find((item) => item.microTag === microTag);
    const summary = topic ? topicSummary(topic, draft.concept) : "";
    const covers = draft.concept?.scope?.covers ?? [];
    const excluded = outOfScope(draft, draft.concept);
    return [
        `${topic?.title ?? draft.target.chapter.title}${summary ? ` (${summary})` : ""}`,
        covers.length ? `Covers only: ${covers.join("; ")}` : "",
        excluded.length ? `Does NOT cover: ${excluded.join("; ")}` : "",
    ].filter(Boolean).join(". ");
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
    const { target } = draft;
    const focus = draft.level === "micro" && target.microTopic
        ? `Explain only the micro-topic "${target.microTopic.title}". Do not teach other parts of the chapter.`
        : draft.level === "sub"
            ? `Explain only the sub-topic "${target.subTopic}", made of: ${target.microTopics.map((topic) => topic.title).join(", ")}.`
            : `Explain the core ideas of the main topic "${target.chapter.title}".`;
    const siblings = target.outside?.length
        ? `\nThe chapter's other lessons, which belong to their own pools: ${target.outside.map((topic) => topic.title).join("; ")}.`
        : "";
    // A micro-topic is fenced off from its neighbours; a sub-topic or chapter must keep every one
    // of its own micro-topics inside the boundary.
    const boundaryAsk = draft.level === "micro"
        ? `- covers: 3 to 6 specific skills this micro-topic includes, each a short phrase a teacher could test (for example "decide whether a collection is well-defined").
- excludes: 3 to 6 neighbouring ideas that a Class ${target.classLevel} textbook teaches in OTHER lessons of this chapter, which questions must not test (for example, for "Adding like fractions": unlike fractions, mixed numbers, subtracting fractions).`
        : `- covers: one specific skill for each of these micro-topics, in this order, each a short phrase a teacher could test (at most 10):
${target.microTopics.map((topic) => topicLine(topic)).join("\n")}
- excludes: 3 to 6 ideas from OUTSIDE ${draft.level === "sub" ? "this sub-topic" : "this chapter"} that questions must not test. Never exclude anything that one of the micro-topics above teaches.`;
    return {
        system: `You write math lessons for Pakistani middle-school students.\n\n${STYLE_RULES}`,
        user: `${scope(draft)}

${focus}${siblings}

Write the concept explanation for this ${LEVEL_WORDS[draft.level]}, and fix its boundary so that every practice question stays inside it:
- title: a short title.
- english: a very simple explanation in 3 to 5 short sentences, with one tiny worked example.
- roman_urdu: the same explanation in warm, conversational Roman Urdu.
- real_life_example: one short, relatable local word problem from Pakistani daily life, in English and in Roman Urdu.
${boundaryAsk}`,
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
    const skills = draft.concept?.scope?.covers.length
        ? `\nSet skill to the IN SCOPE skill each question tests${request.focus?.length ? ", matching the micro-topic the question is written for" : ""}, and use different skills across the batch where you can.`
        : "";
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
${placement}${skills}
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

type FlaggedQuestion = Pick<DraftQuestion, "difficulty" | "microTag" | "questionText" | "options" | "correctOption" | "skill">;

/**
 * Regenerating one question: the normal question request for its micro-topic and difficulty,
 * plus the flagged question and what is wrong with it, so the replacement fixes that problem.
 */
export function rewritePrompt(
    draft: Pick<GenerationDraft, "level" | "target" | "concept">,
    request: { original: FlaggedQuestion; reason: RewriteReason; note?: string; avoid: string[]; feedback?: string[] },
) {
    const { original } = request;
    const base = questionPrompt(draft, {
        difficulty: original.difficulty,
        count: 1,
        avoid: request.avoid,
        feedback: request.feedback,
        focus: draft.level === "micro" ? undefined : [original.microTag],
    });
    const topic = draft.target.microTopics.find((item) => item.microTag === original.microTag);
    const note = request.note?.trim() ? ` The Super Admin adds: "${request.note.trim().slice(0, 300)}"` : "";
    const flagged = [
        `Question: ${original.questionText || "(empty)"}`,
        ...original.options.map((option, index) => `${"ABCD"[index]}) ${option}`),
        `Marked answer: ${original.correctOption}`,
    ].join("\n");
    const keep = original.skill
        ? `Test the same skill ("${original.skill}") if it is inside the micro-topic; otherwise choose an IN SCOPE skill.`
        : "Test the same idea if it is inside the micro-topic; otherwise choose another idea from inside it.";
    return {
        system: base.system,
        user: `${base.user}

REWRITE ONE QUESTION (strict)
The Super Admin flagged this question and wants a corrected replacement. The problem: ${REWRITE_REASONS[request.reason].prompt}${note}
${flagged}
Write exactly 1 new ${original.difficulty.toUpperCase()} question for the micro-topic "${topic?.title ?? draft.target.chapter.title}" that fixes this problem. ${keep} Use new wording, new numbers and new options; never copy the flagged question.`,
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
        ? "Each question must test only its micro-topic. Mark on_topic false if it tests or needs anything listed under \"Does NOT cover\", mainly needs another part of the chapter, or is a broader sub-topic or main-topic question rather than one about this micro-topic."
        : "Mark on_topic false if the question tests anything listed under \"Does NOT cover\", or does not belong to its topic at all.";
    return {
        system: "You are a careful math examiner. Solve each multiple-choice question yourself from scratch before looking at the options, then pick the option that equals your answer. Do not guess, and never pick an option just because it is the closest.",
        user: `Solve every question below independently. For each, give the id, one or two lines of working, your final answer, and the letter of the option that equals it. If no option equals your answer, or two options are the same answer, choose "none".
Also say whether the question tests its stated topic. ${strictness} If it is off topic, say why in topic_note in one short sentence; otherwise leave topic_note empty.

${listing}`,
    };
}

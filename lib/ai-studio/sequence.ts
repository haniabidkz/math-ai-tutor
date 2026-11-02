import { completeJson } from "@/lib/ai-studio/ai";
import { CURRICULUM_NAME } from "@/lib/ai-studio/types";
import { classOutline, type SequencedChapter } from "@/lib/curriculum-order";
import type { MicroConcept } from "@/types/curriculum";

/**
 * Curriculum sequencing. The textbook decides the order of chapters, sub-topics and lessons,
 * never the order in which content was generated. The model knows the textbook's table of
 * contents and returns the order; the code validates it, turns it into ordering fields and
 * leaves anything it could not place flagged for the Super Admin.
 */

export const SEQUENCE_TEXTBOOK = `${CURRICULUM_NAME} (with the Sindh Textbook Board sequence where the two agree)`;

export interface SequenceProposal {
    chapters: Array<{ topicId: string; subTopics: Array<{ name: string; lessons: string[] }> }>;
    notes: string;
}

export const sequenceSchema = {
    type: "object",
    additionalProperties: false,
    required: ["chapters", "notes"],
    properties: {
        chapters: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["topic_id", "sub_topics"],
                properties: {
                    topic_id: { type: "string" },
                    sub_topics: {
                        type: "array",
                        items: {
                            type: "object",
                            additionalProperties: false,
                            required: ["name", "lessons"],
                            properties: { name: { type: "string" }, lessons: { type: "array", items: { type: "string" } } },
                        },
                    },
                },
            },
        },
        notes: { type: "string" },
    },
};

function outlineText(outline: SequencedChapter[]): string {
    return outline.map((chapter) => [
        `Chapter ${chapter.topicId}: ${chapter.title}`,
        ...chapter.subTopics.flatMap((group) => [
            `  Sub-topic: ${group.name ?? "(none given)"}`,
            ...group.lessons.map((lesson) => `    - ${lesson.microTag}: ${lesson.title}`),
        ]),
    ].join("\n")).join("\n");
}

export function sequencePrompt(classLevel: number, outline: SequencedChapter[]) {
    return {
        system: "You are a Pakistani middle-school mathematics curriculum expert. You know the chapter order, section order and lesson order of the textbooks used in Pakistani schools.",
        user: `Textbook: ${SEQUENCE_TEXTBOOK}
Class: ${classLevel}

Below is every chapter (main topic), sub-topic and lesson (micro-topic) this class has, in the order they were created, which may be wrong.
${outlineText(outline)}

Put ALL of it in the order the Class ${classLevel} textbook teaches it:
- chapters in textbook order, each named by its topic_id exactly as given;
- inside each chapter, sub-topics in textbook order; keep the given sub-topic names where they are sensible, give a short textbook-style name to lessons that have none, and never invent extra lessons;
- inside each sub-topic, lessons in the order the textbook teaches them, each named by its micro_tag exactly as given.
Every lesson must appear exactly once, and no lesson may be dropped or moved to another chapter. In notes, say in one or two sentences what you changed or could not decide.`,
    };
}

export interface SequencePlacement {
    microTag: string;
    topicOrder: number;
    subTopicOrder: number;
    order: number;
    subTopic: string;
}

/**
 * Turns the model's order into ordering fields, refusing a proposal that loses, doubles or
 * moves a lesson. Sub-topic names come from the proposal only where a lesson had none.
 */
export function placementsFrom(outline: SequencedChapter[], proposal: SequenceProposal): { placements: SequencePlacement[] } | { error: string } {
    const known = new Map<string, { topicId: string; subTopic: string | null }>();
    for (const chapter of outline) for (const group of chapter.subTopics) for (const lesson of group.lessons) known.set(lesson.microTag, { topicId: chapter.topicId, subTopic: lesson.subTopic });
    const chapterIds = new Set(outline.map((chapter) => chapter.topicId));
    const seenChapters = new Set<string>();
    const placed = new Set<string>();
    const placements: SequencePlacement[] = [];

    try {
        proposal.chapters.forEach((chapter, topicOrder) => {
            if (!chapterIds.has(chapter.topicId)) throw new Error(`unknown chapter ${chapter.topicId}`);
            if (seenChapters.has(chapter.topicId)) throw new Error(`chapter ${chapter.topicId} appears twice`);
            seenChapters.add(chapter.topicId);
            let order = 0;
            chapter.subTopics.forEach((group, subTopicOrder) => {
                for (const microTag of group.lessons) {
                    const lesson = known.get(microTag);
                    if (!lesson) throw new Error(`unknown lesson ${microTag}`);
                    if (lesson.topicId !== chapter.topicId) throw new Error(`lesson ${microTag} moved to another chapter`);
                    if (placed.has(microTag)) throw new Error(`lesson ${microTag} appears twice`);
                    placed.add(microTag);
                    placements.push({ microTag, topicOrder, subTopicOrder, order, subTopic: lesson.subTopic ?? group.name.trim() });
                    order += 1;
                }
            });
        });
        const missing = [...known.keys()].filter((microTag) => !placed.has(microTag));
        if (missing.length) throw new Error(`${missing.length} lesson(s) were left out: ${missing.slice(0, 5).join(", ")}`);
        if (seenChapters.size !== chapterIds.size) throw new Error("a chapter was left out");
    } catch (error) {
        return { error: error instanceof Error ? error.message : "invalid proposal" };
    }
    return { placements };
}

/** The model's reply in the shape the validator wants. */
function parseProposal(raw: unknown): SequenceProposal {
    const data = (raw ?? {}) as { chapters?: Array<{ topic_id?: unknown; sub_topics?: Array<{ name?: unknown; lessons?: unknown }> }>; notes?: unknown };
    return {
        chapters: (Array.isArray(data.chapters) ? data.chapters : []).map((chapter) => ({
            topicId: String(chapter.topic_id ?? ""),
            subTopics: (Array.isArray(chapter.sub_topics) ? chapter.sub_topics : []).map((group) => ({
                name: String(group.name ?? ""),
                lessons: Array.isArray(group.lessons) ? group.lessons.map(String) : [],
            })),
        })),
        notes: String(data.notes ?? ""),
    };
}

export interface SequenceResult {
    outline: SequencedChapter[];
    placements: SequencePlacement[];
    notes: string;
    model: string;
}

/** Asks the textbook order of a whole class; a reply that breaks the rules is asked for once more. */
export async function proposeSequence(concepts: MicroConcept[], classLevel: number): Promise<SequenceResult> {
    const outline = classOutline(concepts, classLevel);
    if (!outline.length) throw new Error(`Class ${classLevel} has no lessons to order`);
    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const prompt = sequencePrompt(classLevel, outline);
        const reply = await completeJson<unknown>({
            role: "generation",
            system: prompt.system,
            user: lastError ? `${prompt.user}\n\nYour previous answer was rejected: ${lastError}. Answer again with every lesson exactly once.` : prompt.user,
            schemaName: "curriculum_sequence",
            schema: sequenceSchema,
            maxOutputTokens: 12_000,
            timeoutMs: 90_000,
            budgetMs: 120_000,
            reasoningEffort: "medium",
        });
        const proposal = parseProposal(reply.data);
        const result = placementsFrom(outline, proposal);
        if ("placements" in result) return { outline, placements: result.placements, notes: proposal.notes, model: reply.model };
        lastError = result.error;
    }
    throw new Error(`The model could not order Class ${classLevel} cleanly (${lastError}).`);
}

export interface NewLessonPlacement {
    /** Position among the class's chapters (0-based); for an existing chapter, its current position. */
    chapterIndex: number;
    /** Position inside the chapter's lessons (0-based). */
    lessonIndex: number;
    subTopic: string | null;
    /** Where the position came from; "unknown" when the model could not answer in time. */
    source: "ai" | "unknown";
    note: string;
}

export const placementSchema = {
    type: "object",
    additionalProperties: false,
    required: ["chapter_position", "lesson_position", "sub_topic", "note"],
    properties: {
        chapter_position: { type: "integer" },
        lesson_position: { type: "integer" },
        sub_topic: { type: "string" },
        note: { type: "string" },
    },
};

/**
 * Where one new lesson belongs: among the chapter's existing lessons and, for a new chapter,
 * among the class's chapters. A model that cannot answer leaves the lesson at the end, flagged.
 */
export async function placeNewLesson(input: {
    classLevel: number;
    concepts: MicroConcept[];
    chapter: { topicId: string | null; title: string };
    lesson: { title: string; subTopic: string | null };
}): Promise<NewLessonPlacement> {
    const outline = classOutline(input.concepts, input.classLevel);
    const existingIndex = input.chapter.topicId ? outline.findIndex((chapter) => chapter.topicId === input.chapter.topicId) : -1;
    const atEnd: NewLessonPlacement = {
        chapterIndex: existingIndex >= 0 ? existingIndex : outline.length,
        lessonIndex: existingIndex >= 0 ? outline[existingIndex].subTopics.reduce((sum, group) => sum + group.lessons.length, 0) : 0,
        subTopic: input.lesson.subTopic,
        source: "unknown",
        note: "",
    };
    try {
        const chapterLessons = existingIndex >= 0 ? outline[existingIndex].subTopics.flatMap((group) => group.lessons) : [];
        const reply = await completeJson<{ chapter_position: number; lesson_position: number; sub_topic: string; note: string }>({
            role: "generation",
            system: "You are a Pakistani middle-school mathematics curriculum expert who knows the textbooks' tables of contents.",
            user: `Textbook: ${SEQUENCE_TEXTBOOK}
Class: ${input.classLevel}

Chapters of this class in their current order (0-based positions):
${outline.map((chapter, index) => `${index}. ${chapter.title} (${chapter.topicId})`).join("\n") || "(none yet)"}

${existingIndex >= 0
    ? `The new lesson belongs to the existing chapter "${input.chapter.title}", whose lessons are currently, in order (0-based positions):\n${chapterLessons.map((lesson, index) => `${index}. ${lesson.title}${lesson.subTopic ? ` [${lesson.subTopic}]` : ""}`).join("\n") || "(none yet)"}`
    : `The new lesson starts a NEW chapter "${input.chapter.title}", which must be placed among the chapters above.`}

New lesson: "${input.lesson.title}"${input.lesson.subTopic ? ` (sub-topic: ${input.lesson.subTopic})` : ""}

Answer where the textbook teaches it:
- chapter_position: ${existingIndex >= 0 ? `the position of its chapter, which is ${existingIndex}` : `the position the new chapter takes among the chapters (0 = first, ${outline.length} = after all of them)`};
- lesson_position: the position the new lesson takes among the chapter's lessons (0 = first${chapterLessons.length ? `, ${chapterLessons.length} = after all of them` : ""});
- sub_topic: the textbook's sub-topic (section) name for this lesson, or the given one;
- note: one short sentence on why.`,
            schemaName: "lesson_placement",
            schema: placementSchema,
            maxOutputTokens: 4_000,
            timeoutMs: 45_000,
            budgetMs: 60_000,
            reasoningEffort: "low",
        });
        const chapterIndex = existingIndex >= 0 ? existingIndex : Math.max(0, Math.min(outline.length, Math.round(Number(reply.data.chapter_position))));
        const lessonIndex = Math.max(0, Math.min(chapterLessons.length, Math.round(Number(reply.data.lesson_position))));
        if (!Number.isFinite(chapterIndex) || !Number.isFinite(lessonIndex)) return atEnd;
        return { chapterIndex, lessonIndex, subTopic: input.lesson.subTopic ?? (String(reply.data.sub_topic ?? "").trim() || null), source: "ai", note: String(reply.data.note ?? "").slice(0, 300) };
    } catch (error) {
        console.error("Lesson placement failed; the lesson goes to the end of its chapter", error);
        return atEnd;
    }
}

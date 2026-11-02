import { familyForTopic, nextTopicOrder, suggestMicroTag, suggestTopicId, topicsForClass, visualForFamily } from "@/lib/concept-autofill";
import { MISCONCEPTIONS } from "@/lib/mistake-analysis";
import type { NewLessonPlacement } from "@/lib/ai-studio/sequence";
import { CURRICULUM_NAME, OPTION_LETTERS, withHelp, type DraftQuestion, type GenerationDraft, type GenerationLevel } from "@/lib/ai-studio/types";
import { classOutline, orderConcepts } from "@/lib/curriculum-order";
import type { LocalizedText, MicroConcept, QuestionBankItem, QuestionOptionAnalysis } from "@/types/curriculum";

const same = (english: string): LocalizedText => ({ english, romanUrdu: english });

/**
 * A draft question in the live question-bank format used by every quiz. Only a micro-topic
 * question keeps its hint, worked solution and wrong-option reasons; the other pools only mark.
 */
export function toQuestionBankItem(
    question: DraftQuestion,
    target: { id: string; microTag: string; prerequisiteTag: string | null; classLevel: QuestionBankItem["classLevel"] },
    level: GenerationLevel = "micro",
): QuestionBankItem {
    const help = withHelp(level);
    const empty: LocalizedText = { english: "", romanUrdu: "" };
    const optionAnalysis: QuestionOptionAnalysis = {};
    for (const letter of OPTION_LETTERS) {
        if (!help || letter === question.correctOption) continue;
        const reason = question.wrongReasons[letter];
        if (!reason) continue;
        optionAnalysis[letter] = {
            mistakeType: MISCONCEPTIONS[reason.misconceptionTag].mistakeType,
            misconceptionTag: reason.misconceptionTag,
            whyWrong: { english: reason.english, romanUrdu: reason.romanUrdu },
        };
    }
    return {
        id: target.id,
        microTag: target.microTag,
        prerequisiteTag: target.prerequisiteTag,
        classLevel: target.classLevel,
        difficulty: question.difficulty,
        // Questions and options are English only; the app shows them in English.
        question: same(question.questionText),
        options: OPTION_LETTERS.map((letter, index) => ({ id: letter, ...same(question.options[index] ?? "") })),
        correctOptionId: question.correctOption,
        hint: help ? question.hint : empty,
        explanation: help ? question.solution : empty,
        ...(help ? { optionAnalysis } : {}),
        level,
        // Every generated question follows Oxford Countdown.
        source: "oxford",
        status: "published",
        version: 1,
    };
}

/**
 * The lesson for a brand-new micro-topic, placed at the end of its chapter with the same
 * automatic rules the curriculum form uses.
 */
export function newConceptFromDraft(
    draft: Pick<GenerationDraft, "target" | "concept">,
    existing: MicroConcept[],
): MicroConcept {
    const { target, concept } = draft;
    if (!target.microTopic || !concept) throw new Error("A new micro-topic needs its title and concept explanation");
    const classLevel = target.classLevel;
    const topics = topicsForClass(existing, classLevel);
    const chapter = target.chapter.topicId ? topics.find((topic) => topic.topicId === target.chapter.topicId) ?? null : null;
    const topicId = chapter?.topicId ?? suggestTopicId(classLevel, target.chapter.title, topics.map((topic) => topic.topicId));
    const family = chapter?.family ?? familyForTopic(classLevel, target.chapter.title);

    return {
        microTag: suggestMicroTag(classLevel, target.microTopic.title, existing.map((item) => item.microTag)),
        prerequisiteTag: chapter?.lastMicroTag ?? null,
        classLevel,
        topicId,
        topicTitle: chapter?.title ?? same(target.chapter.title),
        title: same(target.microTopic.title),
        concept: concept.explanation,
        example: concept.example,
        ...(target.subTopic ? { subTopic: same(target.subTopic) } : {}),
        family,
        visualKind: chapter?.visualKind ?? visualForFamily(family),
        order: chapter?.nextOrder ?? 0,
        // A new chapter comes after the class's existing ones, so it unlocks last.
        topicOrder: chapter?.topicOrder ?? nextTopicOrder(topics),
        status: "published",
    };
}

/**
 * Puts a new lesson where the textbook teaches it: at the given place among its chapter's
 * lessons, and a new chapter at the given place among the class's chapters. The chapter's
 * lessons are renumbered so every place stays unique, and later chapters move down one.
 */
export function placeLesson(
    concept: MicroConcept,
    existing: MicroConcept[],
    placement: NewLessonPlacement,
): { concept: MicroConcept; shifts: Map<string, Partial<Pick<MicroConcept, "order" | "topicOrder">>> } {
    const shifts = new Map<string, Partial<Pick<MicroConcept, "order" | "topicOrder">>>();
    const inClass = existing.filter((item) => item.classLevel === concept.classLevel && item.microTag !== concept.microTag);
    const lessons = orderConcepts(inClass.filter((item) => item.topicId === concept.topicId));
    const at = Math.max(0, Math.min(lessons.length, placement.lessonIndex));
    const before = lessons[at - 1];
    const after = lessons[at];
    const subTopicOrder = before?.subTopicOrder ?? after?.subTopicOrder;
    const placed: MicroConcept = {
        ...concept,
        order: at,
        ...(typeof subTopicOrder === "number" ? { subTopicOrder } : {}),
        // The lesson just before it in the textbook is what a student needs first.
        prerequisiteTag: before?.microTag ?? null,
        ...(placement.subTopic && !concept.subTopic ? { subTopic: same(placement.subTopic) } : {}),
        sequence: { source: placement.source, textbook: CURRICULUM_NAME, ...(placement.note ? { note: placement.note } : {}) },
    };
    lessons.forEach((lesson, index) => {
        const order = index < at ? index : index + 1;
        if (lesson.order !== order) shifts.set(lesson.microTag, { order });
    });
    if (!lessons.length) {
        // A new chapter takes the place of the chapter now at that position, which moves down with the rest.
        const chapters = classOutline(inClass, concept.classLevel);
        const atChapter = chapters[placement.chapterIndex];
        if (atChapter && typeof atChapter.topicOrder === "number") {
            placed.topicOrder = atChapter.topicOrder;
            for (const item of inClass) {
                if (!item.foundationOnly && typeof item.topicOrder === "number" && item.topicOrder >= atChapter.topicOrder) {
                    shifts.set(item.microTag, { ...shifts.get(item.microTag), topicOrder: item.topicOrder + 1 });
                }
            }
        } else if (atChapter) {
            // The chapter there has no place of its own, so the new one goes last and is flagged.
            placed.sequence = { ...placed.sequence!, source: "unknown" };
        }
    }
    return { concept: placed, shifts };
}

/** Question ids are readable and grouped by micro-topic, e.g. c6-integers-intro-ai-3f9a2c1d. */
export function aiQuestionId(microTag: string, random: string): string {
    return `${microTag}-ai-${random.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`;
}

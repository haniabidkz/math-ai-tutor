import { familyForTopic, suggestMicroTag, suggestTopicId, topicsForClass, visualForFamily } from "@/lib/concept-autofill";
import { MISCONCEPTIONS } from "@/lib/mistake-analysis";
import { OPTION_LETTERS, type DraftQuestion, type GenerationDraft } from "@/lib/ai-studio/types";
import type { LocalizedText, MicroConcept, QuestionBankItem, QuestionOptionAnalysis } from "@/types/curriculum";

const same = (english: string): LocalizedText => ({ english, romanUrdu: english });

/** A draft question in the live question-bank format used by every quiz. */
export function toQuestionBankItem(
    question: DraftQuestion,
    target: { id: string; microTag: string; prerequisiteTag: string | null; classLevel: QuestionBankItem["classLevel"] },
): QuestionBankItem {
    const optionAnalysis: QuestionOptionAnalysis = {};
    for (const letter of OPTION_LETTERS) {
        if (letter === question.correctOption) continue;
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
        hint: question.hint,
        explanation: question.solution,
        optionAnalysis,
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
        status: "published",
    };
}

/** Question ids are readable and grouped by micro-topic, e.g. c6-integers-intro-ai-3f9a2c1d. */
export function aiQuestionId(microTag: string, random: string): string {
    return `${microTag}-ai-${random.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`;
}

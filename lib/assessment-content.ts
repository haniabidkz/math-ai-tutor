import { adminDb } from "@/lib/firebase-admin";
import { MICRO_CONCEPTS, getConcept } from "@/lib/curriculum";
import { QUESTION_BANK } from "@/lib/question-bank";
import { DEFAULT_ASSESSMENT_CONFIG } from "@/types/curriculum";
import type {
    AssessmentConfig,
    Difficulty,
    Locale,
    MicroConcept,
    QuestionBankItem,
} from "@/types/curriculum";

export interface ClientQuestion {
    id: string;
    microTag: string;
    difficulty: Difficulty;
    question: string;
    options: Array<{ id: "A" | "B" | "C" | "D"; text: string }>;
}

export function localized(value: { english: string; romanUrdu: string }, locale: Locale) {
    return locale === "roman-urdu" ? value.romanUrdu : value.english;
}

export function toClientQuestion(question: QuestionBankItem, locale: Locale): ClientQuestion {
    return {
        id: question.id,
        microTag: question.microTag,
        difficulty: question.difficulty,
        question: localized(question.question, locale),
        options: question.options.map((option) => ({ id: option.id, text: localized(option, locale) })),
    };
}

function sortById<T extends { id: string }>(items: T[]) {
    return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

export async function getAssessmentConfig(): Promise<AssessmentConfig> {
    const snapshot = await adminDb.collection("assessmentConfigs").doc("default").get();
    return snapshot.exists
        ? { ...DEFAULT_ASSESSMENT_CONFIG, ...(snapshot.data() as Partial<AssessmentConfig>) }
        : DEFAULT_ASSESSMENT_CONFIG;
}

export async function getPublishedConcept(microTag: string): Promise<MicroConcept | undefined> {
    const snapshot = await adminDb.collection("microConcepts").doc(microTag).get();
    if (snapshot.exists && snapshot.data()?.status === "published") {
        return { ...snapshot.data(), microTag: snapshot.id } as MicroConcept;
    }
    return getConcept(microTag);
}

export async function getPublishedQuestions(microTag: string): Promise<QuestionBankItem[]> {
    const snapshot = await adminDb.collection("questions").where("microTag", "==", microTag).get();
    const questions = snapshot.docs
        .map((doc) => ({ ...doc.data(), id: doc.id }) as QuestionBankItem)
        .filter((question) => question.status === "published");

    // The bundled bank keeps local development usable before the first idempotent seed.
    return sortById(questions.length ? questions : QUESTION_BANK.filter((question) => question.microTag === microTag));
}

export async function selectQuestion(options: {
    microTag: string;
    difficulty?: Difficulty;
    usedIds?: string[];
}): Promise<QuestionBankItem> {
    const questions = await getPublishedQuestions(options.microTag);
    const unused = questions.filter((question) => !options.usedIds?.includes(question.id));
    const preferred = unused.filter((question) => !options.difficulty || question.difficulty === options.difficulty);
    const selected = preferred[0] ?? unused[0] ?? questions[0];
    if (!selected) throw new Error(`No published questions for ${options.microTag}`);
    return selected;
}

export async function selectQuizQuestions(microTag: string, count: number, preferredDifficulty: Difficulty = "easy"): Promise<QuestionBankItem[]> {
    const questions = await getPublishedQuestions(microTag);
    const difficultyOrder: Difficulty[] = preferredDifficulty === "hard"
        ? ["hard", "hard", "hard", "medium", "medium", "medium", "easy", "easy", "easy", "easy"]
        : preferredDifficulty === "medium"
            ? ["medium", "medium", "medium", "easy", "easy", "easy", "easy", "hard", "hard", "hard"]
            : ["easy", "easy", "easy", "easy", "medium", "medium", "medium", "hard", "hard", "hard"];
    const selected: QuestionBankItem[] = [];

    for (let index = 0; index < count; index += 1) {
        const target = difficultyOrder[index % difficultyOrder.length];
        const candidate = questions.find((question) => question.difficulty === target && !selected.some((item) => item.id === question.id))
            ?? questions.find((question) => !selected.some((item) => item.id === question.id));
        if (candidate) selected.push(candidate);
    }
    return selected;
}

export async function getRuntimeConcepts() {
    const snapshot = await adminDb.collection("microConcepts").where("status", "==", "published").get();
    if (snapshot.empty) return MICRO_CONCEPTS;
    return snapshot.docs.map((doc) => ({ ...doc.data(), microTag: doc.id }) as MicroConcept);
}

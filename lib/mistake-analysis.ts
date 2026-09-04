import type {
    LocalizedOption,
    LocalizedText,
    MistakeType,
    OptionAnalysis,
    QuestionBankItem,
    QuestionOptionAnalysis,
} from "@/types/curriculum";

export type { MistakeType, OptionAnalysis, QuestionOptionAnalysis };

const text = (english: string, romanUrdu: string): LocalizedText => ({ english, romanUrdu });

export const MISTAKE_TYPE_LABELS: Record<MistakeType, LocalizedText> = {
    "sign-error": text("Sign error", "Nishan ki ghalti"),
    "operation-confusion": text("Wrong operation", "Ghalat amal"),
    "inverse-operation": text("Inverse operation slip", "Ulta amal ki ghalti"),
    "coefficient-misread": text("Coefficient misread", "Coefficient ghalat parha"),
    "ratio-order": text("Ratio order reversed", "Ratio ka tarteeb ulat"),
    "partial-step": text("Stopped one step early", "Aik qadam pehle ruk gaye"),
    "off-by-one": text("Off by one", "Aik ka farq"),
    computation: text("Calculation slip", "Hisaab ki ghalti"),
};

/** Shown when a mistake type repeats often enough to look like a misconception. */
export const MISTAKE_TYPE_GUIDANCE: Record<MistakeType, LocalizedText> = {
    "sign-error": text(
        "Signs tell you direction. Moving left of zero makes a value negative, moving right makes it positive. Write the sign down before you calculate.",
        "Nishan simt batata hai. Zero se baen taraf qeemat manfi hoti hai, daen taraf musbat. Hisaab se pehle nishan likh lein.",
    ),
    "operation-confusion": text(
        "Read the question twice and underline the action word. 'Total' means add, 'difference' means subtract, 'each' often means multiply or divide.",
        "Sawal do baar parhein aur amal ka lafz underline karein. 'Total' jama, 'difference' tafreeq, aur 'each' aksar zarb ya taqseem ka matlab hai.",
    ),
    "inverse-operation": text(
        "To free the variable, undo what is done to it. Undo addition with subtraction, and undo multiplication with division, on both sides.",
        "Variable ko alag karne ke liye ulta amal karein. Jama ko tafreeq se aur zarb ko taqseem se khatam karein, dono taraf.",
    ),
    "coefficient-misread": text(
        "The coefficient is the number multiplying the variable, not the number standing alone. In 5x + 3, the coefficient is 5.",
        "Coefficient wo number hai jo variable ke sath zarb hota hai, akela number nahin. 5x + 3 mein coefficient 5 hai.",
    ),
    "ratio-order": text(
        "A ratio keeps its order. In a:b the first quantity always stays first, and both parts scale by the same factor.",
        "Ratio ka tarteeb barqarar rehta hai. a:b mein pehli quantity hamesha pehle rehti hai, aur dono hissay aik hi factor se barhte hain.",
    ),
    "partial-step": text(
        "Multi-step questions need every step. After the first operation, check whether the variable is fully alone before answering.",
        "Kai qadam wale sawalon mein har qadam zaroori hai. Pehle amal ke baad dekhein ke variable poori tarah akela hua ya nahin.",
    ),
    "off-by-one": text(
        "Count the steps carefully, including the starting point. Marking them on a number line prevents slipping by one.",
        "Qadam ghor se ginein, shuruati nuqta shamil karke. Number line par nishan lagane se aik ka farq nahin hota.",
    ),
    computation: text(
        "The method was right but the arithmetic slipped. Redo the calculation slowly and check it once before choosing.",
        "Tareeqa durust tha lekin hisaab mein ghalti hui. Hisaab ahista dobara karein aur chunne se pehle aik baar check karein.",
    ),
};

function toNumber(value: string): number | null {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Classifies a distractor by comparing it with the correct answer and the concept family.
 * Used when a question has no authored analysis, so existing content stays useful.
 */
export function deriveMistakeType(question: QuestionBankItem, optionId: LocalizedOption["id"]): MistakeType {
    const option = question.options.find((item) => item.id === optionId);
    const correct = question.options.find((item) => item.id === question.correctOptionId);
    const tag = question.microTag;
    const chosenValue = option ? toNumber(option.english) : null;
    const correctValue = correct ? toNumber(correct.english) : null;

    if (chosenValue !== null && correctValue !== null) {
        if (chosenValue === -correctValue && chosenValue !== 0) return "sign-error";
        if (Math.abs(chosenValue - correctValue) === 1) return "off-by-one";
    }

    if (tag.includes("coefficient")) return "coefficient-misread";
    if (tag.includes("ratio") || tag.includes("proportion")) return "ratio-order";
    if (tag.includes("negative") || tag.includes("integer") || tag.includes("number-line")) return "sign-error";
    if (tag.includes("multi-step") || tag.includes("two-step") || tag.includes("word-problem")) return "partial-step";
    if (tag.includes("equation")) return "inverse-operation";
    if (tag.includes("addition") || tag.includes("subtraction")) return "operation-confusion";
    return "computation";
}

function derivedExplanation(mistakeType: MistakeType, correctText: string): OptionAnalysis {
    const label = MISTAKE_TYPE_LABELS[mistakeType];
    return {
        mistakeType,
        explanation: text(
            `${label.english}: the correct answer is ${correctText}. ${MISTAKE_TYPE_GUIDANCE[mistakeType].english}`,
            `${label.romanUrdu}: durust jawab ${correctText} hai. ${MISTAKE_TYPE_GUIDANCE[mistakeType].romanUrdu}`,
        ),
    };
}

/** Authored analysis wins; otherwise a deterministic analysis is derived from the question. */
export function getOptionAnalysis(
    question: QuestionBankItem,
    optionId: LocalizedOption["id"],
): OptionAnalysis | null {
    if (optionId === question.correctOptionId) return null;
    const authored = question.optionAnalysis?.[optionId];
    if (authored) return authored;
    const correct = question.options.find((item) => item.id === question.correctOptionId);
    return derivedExplanation(deriveMistakeType(question, optionId), correct?.english ?? "");
}

/** Builds analysis for all three distractors, used when generating or seeding content. */
export function buildOptionAnalysis(question: QuestionBankItem): QuestionOptionAnalysis {
    const analysis: QuestionOptionAnalysis = {};
    for (const option of question.options) {
        if (option.id === question.correctOptionId) continue;
        const derived = getOptionAnalysis(question, option.id);
        if (derived) analysis[option.id] = derived;
    }
    return analysis;
}

export const DEFAULT_MISCONCEPTION_THRESHOLD = 3;

/** A repeated mistake of the same type on the same concept is treated as a misconception. */
export function isPossibleMisconception(count: number, threshold = DEFAULT_MISCONCEPTION_THRESHOLD): boolean {
    return count >= Math.max(2, threshold);
}

export function mistakeProfileId(microTag: string, mistakeType: MistakeType): string {
    return `${microTag}__${mistakeType}`;
}

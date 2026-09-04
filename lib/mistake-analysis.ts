import type {
    LocalizedOption,
    LocalizedText,
    MisconceptionTag,
    MistakeType,
    OptionAnalysis,
    QuestionBankItem,
    QuestionOptionAnalysis,
} from "@/types/curriculum";

export type { MisconceptionTag, MistakeType, OptionAnalysis, QuestionOptionAnalysis };

const text = (english: string, romanUrdu: string): LocalizedText => ({ english, romanUrdu });

export const MISTAKE_TYPE_LABELS: Record<MistakeType, LocalizedText> = {
    concept: text("Concept", "Concept"),
    calculation: text("Calculation", "Hisaab"),
    sign: text("Sign", "Nishan"),
    operation: text("Operation", "Amal"),
    carelessness: text("Carelessness", "Be-ehtiyati"),
};

interface MisconceptionDefinition {
    mistakeType: MistakeType;
    label: LocalizedText;
    /** Very simple reason shown to the student for a single wrong answer. */
    whyWrong: LocalizedText;
    /** Fuller explanation used once the pattern repeats into a misconception. */
    guidance: LocalizedText;
}

export const MISCONCEPTIONS: Record<MisconceptionTag, MisconceptionDefinition> = {
    "sign-direction": {
        mistakeType: "sign",
        label: text("Sign direction", "Nishan ki simt"),
        whyWrong: text(
            "You picked the same number with the opposite sign. Left of zero is negative, right of zero is positive.",
            "Aap ne wohi number ulte nishan ke sath chuna. Zero se baen manfi, daen musbat hota hai.",
        ),
        guidance: text(
            "Signs tell you direction. Moving left of zero makes a value negative, moving right makes it positive. Write the sign down before you calculate.",
            "Nishan simt batata hai. Zero se baen taraf qeemat manfi hoti hai, daen taraf musbat. Hisaab se pehle nishan likh lein.",
        ),
    },
    "wrong-operation-choice": {
        mistakeType: "operation",
        label: text("Wrong operation", "Ghalat amal"),
        whyWrong: text(
            "This answer comes from using a different operation than the question asks for.",
            "Yeh jawab us amal se aata hai jo sawal ne nahin manga.",
        ),
        guidance: text(
            "Read the question twice and underline the action word. 'Total' means add, 'difference' means subtract, and 'each' often means multiply or divide.",
            "Sawal do baar parhein aur amal ka lafz underline karein. 'Total' jama, 'difference' tafreeq, aur 'each' aksar zarb ya taqseem ka matlab hai.",
        ),
    },
    "incomplete-inverse-operation": {
        mistakeType: "concept",
        label: text("Inverse operation", "Ulta amal"),
        whyWrong: text(
            "The variable is not alone yet. One more inverse step is needed on both sides.",
            "Variable abhi akela nahin hua. Dono taraf aik aur ulta qadam baqi hai.",
        ),
        guidance: text(
            "To free the variable, undo what is done to it. Undo addition with subtraction and multiplication with division, on both sides.",
            "Variable ko alag karne ke liye ulta amal karein. Jama ko tafreeq se aur zarb ko taqseem se khatam karein, dono taraf.",
        ),
    },
    "coefficient-vs-constant": {
        mistakeType: "concept",
        label: text("Coefficient or constant", "Coefficient ya constant"),
        whyWrong: text(
            "That is the constant, not the coefficient. The coefficient sits next to the variable.",
            "Yeh constant hai, coefficient nahin. Coefficient variable ke sath hota hai.",
        ),
        guidance: text(
            "The coefficient is the number multiplying the variable, not the number standing alone. In 5x + 3 the coefficient is 5.",
            "Coefficient wo number hai jo variable ke sath zarb hota hai, akela number nahin. 5x + 3 mein coefficient 5 hai.",
        ),
    },
    "ratio-order-reversed": {
        mistakeType: "concept",
        label: text("Ratio order", "Ratio ki tarteeb"),
        whyWrong: text(
            "The two parts of the ratio were swapped, so the comparison is the wrong way round.",
            "Ratio ke dono hissay ulat gaye, is liye muqabla ulta ho gaya.",
        ),
        guidance: text(
            "A ratio keeps its order. In a:b the first quantity always stays first, and both parts scale by the same factor.",
            "Ratio ka tarteeb barqarar rehta hai. a:b mein pehli quantity hamesha pehle rehti hai, aur dono hissay aik hi factor se barhte hain.",
        ),
    },
    "stopped-before-final-step": {
        mistakeType: "concept",
        label: text("Unfinished solution", "Adhoora hal"),
        whyWrong: text(
            "This is the answer after only part of the work. One more step was needed.",
            "Yeh sirf adhay kaam ka jawab hai. Aik qadam aur baqi tha.",
        ),
        guidance: text(
            "Multi-step questions need every step. After the first operation, check whether the variable is fully alone before answering.",
            "Kai qadam wale sawalon mein har qadam zaroori hai. Pehle amal ke baad dekhein ke variable poori tarah akela hua ya nahin.",
        ),
    },
    "off-by-one-count": {
        mistakeType: "carelessness",
        label: text("Off by one", "Aik ka farq"),
        whyWrong: text(
            "The answer is one step away from the correct value, so a count was missed.",
            "Jawab durust qeemat se aik qadam door hai, yani ginti mein aik reh gaya.",
        ),
        guidance: text(
            "Count the steps carefully, including the starting point. Marking them on a number line prevents slipping by one.",
            "Qadam ghor se ginein, shuruati nuqta shamil karke. Number line par nishan lagane se aik ka farq nahin hota.",
        ),
    },
    "arithmetic-slip": {
        mistakeType: "calculation",
        label: text("Calculation slip", "Hisaab ki ghalti"),
        whyWrong: text(
            "The method looks right but the arithmetic came out different.",
            "Tareeqa theek lagta hai lekin hisaab alag nikla.",
        ),
        guidance: text(
            "The method was right but the arithmetic slipped. Redo the calculation slowly and check it once before choosing.",
            "Tareeqa durust tha lekin hisaab mein ghalti hui. Hisaab ahista dobara karein aur chunne se pehle aik baar check karein.",
        ),
    },
};

function toNumber(value: string): number | null {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Classifies a distractor by comparing it with the correct answer and the concept family,
 * so questions without authored analysis still produce useful feedback.
 */
export function deriveMisconceptionTag(question: QuestionBankItem, optionId: LocalizedOption["id"]): MisconceptionTag {
    const option = question.options.find((item) => item.id === optionId);
    const correct = question.options.find((item) => item.id === question.correctOptionId);
    const tag = question.microTag;
    const chosenValue = option ? toNumber(option.english) : null;
    const correctValue = correct ? toNumber(correct.english) : null;

    if (chosenValue !== null && correctValue !== null) {
        if (chosenValue === -correctValue && chosenValue !== 0) return "sign-direction";
        if (Math.abs(chosenValue - correctValue) === 1) return "off-by-one-count";
    }

    if (tag.includes("coefficient")) return "coefficient-vs-constant";
    if (tag.includes("ratio") || tag.includes("proportion")) return "ratio-order-reversed";
    if (tag.includes("negative") || tag.includes("integer") || tag.includes("number-line")) return "sign-direction";
    if (tag.includes("multi-step") || tag.includes("two-step") || tag.includes("word-problem")) return "stopped-before-final-step";
    if (tag.includes("equation")) return "incomplete-inverse-operation";
    if (tag.includes("addition") || tag.includes("subtraction")) return "wrong-operation-choice";
    return "arithmetic-slip";
}

/** Authored analysis wins; otherwise a deterministic analysis is derived from the question. */
export function getOptionAnalysis(
    question: QuestionBankItem,
    optionId: LocalizedOption["id"],
): OptionAnalysis | null {
    if (optionId === question.correctOptionId) return null;
    const authored = question.optionAnalysis?.[optionId];
    if (authored) return authored;

    const misconceptionTag = deriveMisconceptionTag(question, optionId);
    const definition = MISCONCEPTIONS[misconceptionTag];
    const correct = question.options.find((item) => item.id === question.correctOptionId);
    return {
        mistakeType: definition.mistakeType,
        misconceptionTag,
        whyWrong: text(
            `${definition.whyWrong.english} The correct answer is ${correct?.english ?? ""}.`,
            `${definition.whyWrong.romanUrdu} Durust jawab ${correct?.english ?? ""} hai.`,
        ),
    };
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

/** A repeated mistake pattern on one concept is treated as a possible misconception. */
export function isPossibleMisconception(count: number, threshold = DEFAULT_MISCONCEPTION_THRESHOLD): boolean {
    return count >= Math.max(2, threshold);
}

export function mistakeProfileId(microTag: string, misconceptionTag: MisconceptionTag): string {
    return `${microTag}__${misconceptionTag}`;
}

import { MICRO_CONCEPTS } from "@/lib/curriculum";
import type { Difficulty, LocalizedOption, MicroConcept, QuestionBankItem } from "@/types/curriculum";

const optionIds: LocalizedOption["id"][] = ["A", "B", "C", "D"];

function difficultyFor(index: number): Difficulty {
    if (index < 4) return "easy";
    if (index < 7) return "medium";
    return "hard";
}

function numericOptions(correct: number, seed: number): LocalizedOption[] {
    const candidates = [correct, correct + 1 + (seed % 2), correct - 1 - (seed % 2), -correct || 2];
    const unique: number[] = [];
    for (const value of candidates) {
        if (!unique.includes(value)) unique.push(value);
    }
    while (unique.length < 4) unique.push(correct + unique.length + 2);
    const rotated = unique.map((_, index) => unique[(index + seed) % unique.length]);
    return rotated.map((value, index) => ({ id: optionIds[index], english: String(value), romanUrdu: String(value) }));
}

function makeQuestion(concept: MicroConcept, index: number): QuestionBankItem {
    const difficulty = difficultyFor(index);
    const source = difficulty === "easy" ? "sindh" : "oxford";
    const a = index + concept.order + 2;
    const b = (index % 4) + 2;
    let promptEnglish = "";
    let promptRomanUrdu = "";
    let correct = 0;
    let hintEnglish = "Use the key idea shown in the concept summary.";
    let hintRomanUrdu = "Concept summary ka bunyadi khayal istemal karein.";

    if (concept.family === "integer") {
        const left = index % 2 === 0 ? -a : a;
        const right = index % 3 === 0 ? -b : b;
        correct = concept.microTag.includes("subtraction") ? left - right : left + right;
        if (concept.microTag.includes("comparison")) {
            correct = Math.max(left, right);
            promptEnglish = `Which integer is greater: ${left} or ${right}?`;
            promptRomanUrdu = `${left} aur ${right} mein kaunsa integer bara hai?`;
        } else if (concept.microTag.includes("positive")) {
            correct = a;
            promptEnglish = `Which value is ${a} steps to the right of zero?`;
            promptRomanUrdu = `Zero se ${a} qadam daen taraf kaunsi qeemat hai?`;
        } else if (concept.microTag.includes("negative")) {
            correct = -a;
            promptEnglish = `Which value is ${a} steps to the left of zero?`;
            promptRomanUrdu = `Zero se ${a} qadam baen taraf kaunsi qeemat hai?`;
        } else {
            const symbol = concept.microTag.includes("subtraction") ? "-" : "+";
            promptEnglish = `Find ${left} ${symbol} (${right}).`;
            promptRomanUrdu = `${left} ${symbol} (${right}) hal karein.`;
        }
        hintEnglish = "Picture the values on a number line.";
        hintRomanUrdu = "Numbers ko number line par sochain.";
    } else if (concept.family === "equation") {
        const x = a;
        const multiplier = difficulty === "hard" ? b : 1;
        const addend = difficulty === "easy" ? b : a - 1;
        const result = multiplier * x + addend;
        correct = x;
        promptEnglish = multiplier === 1
            ? `Solve x + ${addend} = ${result}.`
            : `Solve ${multiplier}x + ${addend} = ${result}.`;
        promptRomanUrdu = multiplier === 1
            ? `x + ${addend} = ${result} hal karein.`
            : `${multiplier}x + ${addend} = ${result} hal karein.`;
        hintEnglish = "Use inverse operations on both sides and keep the equation balanced.";
        hintRomanUrdu = "Dono taraf ulta amal karein aur equation barabar rakhein.";
    } else if (concept.family === "ratio") {
        const scale = b;
        const first = a;
        const second = a + 1;
        correct = second * scale;
        promptEnglish = `If ${first}:${second} = ${first * scale}:x, what is x?`;
        promptRomanUrdu = `Agar ${first}:${second} = ${first * scale}:x ho, to x kya hai?`;
        hintEnglish = "Multiply both parts of a ratio by the same scale factor.";
        hintRomanUrdu = "Ratio ke dono hison ko aik hi scale factor se multiply karein.";
    } else if (concept.family === "algebra") {
        if (concept.microTag.includes("coefficient")) {
            correct = b;
            promptEnglish = `What is the coefficient of x in ${b}x + ${a}?`;
            promptRomanUrdu = `${b}x + ${a} mein x ka coefficient kya hai?`;
        } else if (concept.microTag.includes("evaluat") || concept.microTag.includes("simplif")) {
            correct = b * a + 2;
            promptEnglish = `Evaluate ${b}x + 2 when x = ${a}.`;
            promptRomanUrdu = `Jab x = ${a} ho to ${b}x + 2 ki qeemat nikalein.`;
        } else {
            correct = a + b;
            promptEnglish = `If x = ${a}, what is x + ${b}?`;
            promptRomanUrdu = `Agar x = ${a} ho to x + ${b} kya hoga?`;
        }
        hintEnglish = "Identify the variable, then substitute or combine carefully.";
        hintRomanUrdu = "Variable pehchan kar qeemat rakhein ya terms ko ehtiyat se milayein.";
    } else {
        if (concept.microTag.includes("fraction")) {
            correct = a;
            promptEnglish = `A whole is split into ${a} equal parts. How many equal parts make the whole?`;
            promptRomanUrdu = `Aik poori cheez ${a} barabar hison mein bati ho to tamam hisay kitne hain?`;
        } else if (concept.microTag.includes("ratio")) {
            correct = a * b;
            promptEnglish = `A ratio is 1:${b}. If the first quantity is ${a}, what is the second?`;
            promptRomanUrdu = `Ratio 1:${b} hai. Pehli quantity ${a} ho to doosri kitni hogi?`;
        } else if (concept.microTag.includes("pattern")) {
            correct = a + 3 * b;
            promptEnglish = `Continue the pattern: ${a}, ${a + b}, ${a + 2 * b}, ...`;
            promptRomanUrdu = `Pattern mukammal karein: ${a}, ${a + b}, ${a + 2 * b}, ...`;
        } else {
            correct = a * b;
            promptEnglish = `Calculate ${a} x ${b}.`;
            promptRomanUrdu = `${a} x ${b} hisaab karein.`;
        }
    }

    const options = numericOptions(correct, index);
    const correctOptionId = options.find((option) => option.english === String(correct))!.id;

    return {
        id: `${concept.microTag}-${String(index + 1).padStart(2, "0")}`,
        microTag: concept.microTag,
        prerequisiteTag: concept.prerequisiteTag,
        classLevel: concept.classLevel,
        difficulty,
        question: { english: promptEnglish, romanUrdu: promptRomanUrdu },
        options,
        correctOptionId,
        hint: { english: hintEnglish, romanUrdu: hintRomanUrdu },
        explanation: {
            english: `The correct answer is ${correct}. ${hintEnglish}`,
            romanUrdu: `Durust jawab ${correct} hai. ${hintRomanUrdu}`,
        },
        source,
        status: "published",
        version: 1,
    };
}

export const QUESTION_BANK: QuestionBankItem[] = MICRO_CONCEPTS.flatMap((concept) =>
    Array.from({ length: 10 }, (_, index) => makeQuestion(concept, index))
);

export function getQuestionsForConcept(microTag: string, difficulty?: Difficulty) {
    return QUESTION_BANK.filter(
        (question) => question.microTag === microTag && (!difficulty || question.difficulty === difficulty)
    );
}

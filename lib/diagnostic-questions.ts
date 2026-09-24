import { getConcept } from "@/lib/curriculum";
import { getDiagnosticBlueprint, getDiagnosticQuestionIds } from "@/lib/diagnostic-blueprint";
import { buildOptionAnalysis } from "@/lib/mistake-analysis";
import type { Difficulty, LocalizedOption, QuestionBankItem, StudentClassLevel } from "@/types/curriculum";

type Letter = LocalizedOption["id"];
/** Difficulty, question, options A-D and the correct letter, exactly as supplied by the owner. */
type Entry = [Difficulty, string, [string, string, string, string], Letter];

/**
 * The fixed diagnostic tests, word for word from the owner's question set (September 2026).
 * Each class's test checks the previous class: five topics of easy, medium and hard.
 * Do not edit the wording or answers here without the owner's approval.
 */
const TESTS: Record<StudentClassLevel, Entry[]> = {
    6: [
        // 1. Whole Numbers & Basic Operations
        ["easy", "What is the value of the digit 7 in 47,325?", ["7", "70", "7,000", "70,000"], "C"],
        ["medium", "What is 348 ÷ 6?", ["48", "58", "68", "78"], "B"],
        ["hard", "A school buys 25 boxes of pencils. Each box contains 16 pencils. How many pencils does the school buy in total?", ["300", "350", "400", "450"], "C"],
        // 2. Fractions
        ["easy", "Which fraction is equivalent to 3/4?", ["6/12", "9/12", "8/12", "10/12"], "B"],
        ["medium", "What is 2/5 + 1/5?", ["3/10", "3/5", "2/5", "1/5"], "B"],
        ["hard", "Which fraction is the greatest?", ["2/5", "3/10", "3/5", "1/2"], "C"],
        // 3. Decimals
        ["easy", "What is the value of the digit 6 in 4.63?", ["6", "0.6", "0.06", "60"], "B"],
        ["medium", "What is 3.5 + 1.25?", ["4.25", "4.50", "4.75", "5.25"], "C"],
        ["hard", "Which decimal is the greatest?", ["0.45", "0.54", "0.65", "0.56"], "C"],
        // 4. Factors & Multiples
        ["easy", "Which number is a factor of 24?", ["5", "7", "6", "9"], "C"],
        ["medium", "Which number is a multiple of 8?", ["18", "22", "32", "35"], "C"],
        ["hard", "Which number is prime?", ["15", "21", "27", "17"], "D"],
        // 5. Basic Geometry
        ["easy", "How many degrees are in a right angle?", ["45°", "90°", "120°", "180°"], "B"],
        ["medium", "A rectangle has a length of 8 cm and a width of 3 cm. What is its perimeter?", ["11 cm", "16 cm", "22 cm", "24 cm"], "C"],
        ["hard", "What is the area of a rectangle with a length of 6 cm and a width of 4 cm?", ["10 cm²", "20 cm²", "24 cm²", "28 cm²"], "C"],
    ],
    7: [
        // 1. Whole Numbers & Operations
        ["easy", "What is 4,825 + 2,175?", ["6,500", "6,750", "7,000", "7,500"], "C"],
        ["medium", "What is 7,200 ÷ 9?", ["700", "800", "900", "1,000"], "B"],
        ["hard", "A school buys 36 boxes of pencils. Each box contains 125 pencils. The school gives 1,000 pencils to students. How many pencils are left?", ["3,000", "3,250", "3,500", "4,500"], "C"],
        // 2. Fractions
        ["easy", "What is 3/4 + 1/4?", ["1/2", "3/4", "1", "1 1/4"], "C"],
        ["medium", "What is 5/6 − 1/3?", ["1/3", "1/2", "2/3", "4/6"], "B"],
        ["hard", "Sara has 2 1/2 meters of ribbon. She uses 3/4 meter. How much ribbon is left?", ["1 1/4 m", "1 1/2 m", "1 3/4 m", "2 1/4 m"], "C"],
        // 3. Decimals
        ["easy", "What is 4.5 + 2.3?", ["6.5", "6.8", "7.0", "7.8"], "B"],
        ["medium", "What is 10.5 − 3.75?", ["6.25", "6.50", "6.75", "7.25"], "C"],
        ["hard", "A shopkeeper has 5.5 kg of rice. He sells 2.75 kg and then sells another 1.25 kg. How much rice is left?", ["1.25 kg", "1.50 kg", "1.75 kg", "2.00 kg"], "B"],
        // 4. Factors & Multiples
        ["easy", "Which number is a factor of 48?", ["5", "6", "7", "10"], "B"],
        ["medium", "What is the HCF of 18 and 24?", ["3", "6", "9", "12"], "B"],
        ["hard", "Two buses leave a station every 8 minutes and 12 minutes. If they leave together now, after how many minutes will they leave together again?", ["16 minutes", "20 minutes", "24 minutes", "36 minutes"], "C"],
        // 5. Basic Geometry
        ["easy", "What is the sum of the angles in a triangle?", ["90°", "120°", "180°", "360°"], "C"],
        ["medium", "A rectangle has a length of 12 cm and a width of 5 cm. What is its area?", ["17 cm²", "34 cm²", "60 cm²", "120 cm²"], "C"],
        ["hard", "A rectangular playground is 15 m long and 8 m wide. A student walks once around the playground. How far does the student walk?", ["23 m", "38 m", "46 m", "120 m"], "C"],
    ],
    8: [
        // 1. Integers & Operations
        ["easy", "What is -9 + 14?", ["-23", "-5", "5", "23"], "C"],
        ["medium", "Calculate: -12 + 7 - (-5).", ["-10", "-5", "0", "10"], "C"],
        ["hard", "A diver is 18 meters below sea level. He goes up 25 meters, then goes down 12 meters, and finally goes up 10 meters. Where is he now?", ["5 meters above sea level", "5 meters below sea level", "15 meters above sea level", "15 meters below sea level"], "A"],
        // 2. Fractions & Rational Numbers
        ["easy", "What is 2/7 + 3/7?", ["5/14", "5/7", "6/7", "1"], "B"],
        ["medium", "What is 5/6 - 1/4?", ["1/2", "7/12", "2/12", "3/8"], "B"],
        ["hard", "A water tank is 3/4 full. A family uses 1/3 of the water that is currently in the tank. What fraction of the whole tank is still filled?", ["1/4", "1/2", "5/12", "7/12"], "B"],
        // 3. Decimals & Percentages
        ["easy", "What is 6.4 - 2.1?", ["4.1", "4.3", "4.5", "5.3"], "B"],
        ["medium", "A student scored 36 out of 50 marks. What percentage did the student score?", ["60%", "68%", "72%", "75%"], "C"],
        ["hard", "A school bag costs Rs. 1,500. The shop gives a 20% discount. After the discount, the customer uses a Rs. 100 voucher. How much does the customer pay?", ["Rs. 1,000", "Rs. 1,100", "Rs. 1,200", "Rs. 1,300"], "B"],
        // 4. Ratio, Proportion & Financial Arithmetic
        ["easy", "The ratio of red balls to blue balls is 2:5. If there are 6 red balls, how many blue balls are there?", ["10", "12", "15", "18"], "C"],
        ["medium", "3 notebooks cost Rs. 180. At the same price, how much will 7 notebooks cost?", ["Rs. 360", "Rs. 400", "Rs. 420", "Rs. 450"], "C"],
        ["hard", "A shopkeeper buys a school bag for Rs. 1,200. He marks the price at Rs. 1,500 and then gives a 10% discount. What is his profit?", ["Rs. 120", "Rs. 150", "Rs. 180", "Rs. 300"], "B"],
        // 5. Algebra & Linear Equations
        ["easy", "Simplify: 5x + 2x", ["7", "7x", "10x", "x + 7"], "B"],
        ["medium", "If 3x + 4 = 19, what is the value of x?", ["4", "5", "6", "7"], "B"],
        ["hard", "A number is multiplied by 3 and then 7 is added. The result is 31. What is the number?", ["6", "7", "8", "9"], "C"],
    ],
};

const LETTERS: Letter[] = ["A", "B", "C", "D"];
const same = (value: string) => ({ english: value, romanUrdu: value });

function buildTest(classLevel: StudentClassLevel): QuestionBankItem[] {
    const ids = getDiagnosticQuestionIds(classLevel);
    const topics = getDiagnosticBlueprint(classLevel);
    return TESTS[classLevel].map(([difficulty, question, options, correctOptionId], index) => {
        const topic = topics.find((item) => item.questionIds.includes(ids[index]))!;
        const concept = getConcept(topic.microTag);
        if (!concept) throw new Error(`Diagnostic topic ${topic.topicKey} uses unknown concept ${topic.microTag}`);
        const correct = options[LETTERS.indexOf(correctOptionId)];
        const item: QuestionBankItem = {
            id: ids[index],
            microTag: concept.microTag,
            prerequisiteTag: concept.prerequisiteTag,
            classLevel: concept.classLevel,
            difficulty,
            // The diagnostic is shown in English only.
            question: same(question),
            options: options.map((option, position) => ({ id: LETTERS[position], ...same(option) })),
            correctOptionId,
            // Never shown during the diagnostic; kept so the question stays a complete bank item.
            hint: {
                english: "Read the question carefully and work it out step by step.",
                romanUrdu: "Sawal ghaur se parhein aur qadam ba qadam hal karein.",
            },
            explanation: {
                english: `The correct answer is ${correctOptionId}) ${correct}.`,
                romanUrdu: `Durust jawab ${correctOptionId}) ${correct} hai.`,
            },
            source: "oxford",
            status: "published",
            version: 1,
            purpose: "diagnostic",
            diagnosticFor: classLevel,
        };
        return { ...item, optionAnalysis: buildOptionAnalysis(item) };
    });
}

export const DIAGNOSTIC_QUESTIONS: Record<StudentClassLevel, QuestionBankItem[]> = {
    6: buildTest(6),
    7: buildTest(7),
    8: buildTest(8),
};

export const ALL_DIAGNOSTIC_QUESTIONS: QuestionBankItem[] = [...DIAGNOSTIC_QUESTIONS[6], ...DIAGNOSTIC_QUESTIONS[7], ...DIAGNOSTIC_QUESTIONS[8]];

const BY_ID = new Map(ALL_DIAGNOSTIC_QUESTIONS.map((question) => [question.id, question]));

/** The built-in copy of a diagnostic question, used when the stored one is missing or broken. */
export function getBuiltInDiagnosticQuestion(id: string): QuestionBankItem | undefined {
    return BY_ID.get(id);
}

/** The built-in questions of one class's test, in the order they are asked. */
export function getDiagnosticQuestionOrder(classLevel: StudentClassLevel): QuestionBankItem[] {
    return DIAGNOSTIC_QUESTIONS[classLevel];
}

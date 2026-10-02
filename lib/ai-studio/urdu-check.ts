import type { DraftQuestion } from "@/lib/ai-studio/types";
import type { LocalizedText } from "@/types/curriculum";

/**
 * The Roman Urdu rule: very easy, simple and clean. Bookish Urdu words a Class 6 child may
 * not know are replaced by the simple word, usually the English maths term, inside the Roman
 * Urdu sentence ("fraction" not "kasr"). Everyday words (jama, zarb, taqseem, hisaab, feesad,
 * barabar, qeemat, aadha) are fine and stay.
 */
const HEAVY_WORDS: Array<[RegExp, string, string]> = [
    [/\bkasr\b/i, "kasr", "fraction"],
    [/\ba+sha+riy?a\b|\bashaari\b/i, "ashariya", "decimal"],
    [/\bnisbat\b/i, "nisbat", "ratio"],
    [/\btanasub\b/i, "tanasub", "proportion"],
    [/\bmutanasib\b/i, "mutanasib", "proportional"],
    [/\bmusawat\b/i, "musawat", "equation"],
    [/\btafreeq\b/i, "tafreeq", "minus / subtract"],
    [/\bmajmu+a\b|\bmajmooa\b/i, "majmua", "set"],
    [/\brukn\b|\barkan\b/i, "rukn", "element"],
    [/\bmutagha?y+ir\b/i, "mutaghayyir", "variable"],
    [/\bmusbat\b/i, "musbat", "positive"],
    [/\bmanfi\b/i, "manfi", "negative"],
    [/\bsahih adad\b/i, "sahih adad", "integer"],
    [/\bqudrati\b/i, "qudrati", "natural"],
    [/\bawamil\b/i, "awamil", "factors"],
    [/\baza+f\b/i, "azaaf", "multiples"],
    [/\bmushtarak\b/i, "mushtarak", "common"],
    [/\bmakhraj\b/i, "makhraj", "denominator"],
    [/\bausat\b/i, "ausat", "average"],
    [/\btakhmeena\b/i, "takhmeena", "estimate"],
    [/\bmiqdar\b|\bmikdar\b/i, "miqdar", "amount"],
    [/\bzaviya\b/i, "zaviya", "angle"],
    [/\braqba\b/i, "raqba", "area"],
    [/\bmuheet\b|\bmohit\b/i, "muheet", "perimeter"],
    [/\bmustateel\b/i, "mustateel", "rectangle"],
    [/\bmusallas\b/i, "musallas", "triangle"],
    [/\bmutawazi\b/i, "mutawazi", "parallel"],
    [/\bamoodi\b/i, "amoodi", "perpendicular"],
    [/\bmusawi\b/i, "musawi", "barabar"],
    [/\bmukhalif\b/i, "mukhalif", "opposite / ulta"],
    [/\bmukhtalif\b/i, "mukhtalif", "alag / different"],
    [/\bwazeh\b|\bwazay\b/i, "wazeh", "saaf / clear"],
    [/\btay ?shuda\b/i, "tay shuda", "fixed / clear"],
    [/\bzaati\b/i, "zaati", "apni / own"],
    [/\bshakhs\b/i, "shakhs", "person / banda"],
    [/\bqanoon\b|\bqawaid\b/i, "qanoon", "rule"],
    [/\bistilah\b/i, "istilah", "term"],
];

/**
 * Numbers are written as digits in both languages. Spelled-out Urdu numbers from three up are
 * caught; "ek" and "do" are left alone because they are also everyday words ("ek baar", "do").
 */
const SPELLED_NUMBERS = /\b(teen|chaar|char|paanch|panch|chhe|chhay|aath|nau|das|gyarah|gyara|barah|terah|chaudah|pandrah|solah|satrah|atharah|unnees|bees|tees|chalees|pachaas|pachas|sattar|assi|nabbe|sau|hazaar|hazar|lakh)\b/gi;

export interface HeavyWord { word: string; instead: string }

export function findHeavyUrdu(text: string): HeavyWord[] {
    return HEAVY_WORDS.filter(([pattern]) => pattern.test(text)).map(([, word, instead]) => ({ word, instead }));
}

export function findSpelledNumbers(text: string): string[] {
    return [...new Set((text.match(SPELLED_NUMBERS) ?? []).map((word) => word.toLowerCase()))];
}

/** Numbers in a text, ignoring step markers such as "1." or "Step 2:" at the start of a line. */
const numbersIn = (text: string) =>
    new Set(text.replace(/(^|\n)\s*(?:step\s*|qadam\s*)?\d+\s*[.):]/gi, "$1").match(/\d+(?:[.,:/]\d+)*/g) ?? []);

/** Numbers the English has that the Roman Urdu dropped, usually because it spelled them out. */
export function missingNumbers(english: string, romanUrdu: string): string[] {
    const have = numbersIn(romanUrdu);
    return [...numbersIn(english)].filter((value) => !have.has(value));
}

/** What the model must fix before a Roman Urdu text is accepted. */
export function romanUrduProblems(label: string, romanUrdu: string): string[] {
    return [
        ...findHeavyUrdu(romanUrdu).map(({ word, instead }) => `${label}: the Roman Urdu uses the difficult word "${word}"; use "${instead}" instead`),
        ...findSpelledNumbers(romanUrdu).map((word) => `${label}: the Roman Urdu spells out the number "${word}"; write every number as digits`),
    ];
}

/** Review notes for one bilingual text: the problems above, plus numbers the Roman Urdu lost. */
export function romanUrduIssues(label: string, pair: LocalizedText): string[] {
    const missing = missingNumbers(pair.english, pair.romanUrdu);
    return [
        ...romanUrduProblems(label, pair.romanUrdu),
        ...(missing.length ? [`${label}: the Roman Urdu is missing the number(s) ${missing.join(", ")} that the English has; keep the same numbers in both`] : []),
    ];
}

type UrduParts = Pick<DraftQuestion, "hint" | "solution" | "wrongReasons">;

const parts = (question: UrduParts): Array<[string, LocalizedText]> => [
    ["hint", question.hint],
    ["solution", question.solution],
    ...Object.entries(question.wrongReasons).map(([letter, reason]): [string, LocalizedText] => [`reason for option ${letter}`, { english: reason?.english ?? "", romanUrdu: reason?.romanUrdu ?? "" }]),
];

/** Generation: every Roman Urdu part of a question must pass, or the batch is written again. */
export function questionRomanUrduProblems(prefix: string, question: UrduParts): string[] {
    return parts(question).flatMap(([part, pair]) => romanUrduProblems(`${prefix} ${part}`, pair.romanUrdu));
}

/** Review: the same notes, plus lost numbers, shown on the question card. */
export function questionRomanUrduIssues(prefix: string, question: UrduParts): string[] {
    return parts(question).flatMap(([part, pair]) => romanUrduIssues(`${prefix} ${part}`, pair));
}

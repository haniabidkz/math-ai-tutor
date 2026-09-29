/**
 * Finds questions that repeat another in all but small details: the same wording with other
 * numbers, or the same numbers in reworded text. Exact repeats are caught separately.
 */

const NUMBER = /-?\d+(?:[.,/]\d+)*/g;

/** Words that carry no meaning of their own, so they never make two questions look alike. */
const STOP_WORDS = new Set([
    "the", "and", "for", "are", "was", "were", "with", "what", "which", "how", "many", "much", "does",
    "this", "that", "these", "those", "its", "his", "her", "their", "has", "have", "had", "find",
    "value", "from", "into", "each", "one", "two", "then", "than", "will", "can", "you", "your",
]);

export interface QuestionSignature {
    numbers: string;
    numberCount: number;
    words: Set<string>;
}

export function questionSignature(text: string): QuestionSignature {
    const lower = text.toLowerCase().replace(/[−–—]/g, "-");
    const numbers = (lower.match(NUMBER) ?? []).map((value) => value.replace(/,/g, "")).sort();
    const words = lower
        .replace(NUMBER, " ")
        .split(/[^a-z]+/)
        .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
    return { numbers: numbers.join("|"), numberCount: numbers.length, words: new Set(words) };
}

function overlap(left: Set<string>, right: Set<string>): number {
    if (!left.size && !right.size) return 1;
    let shared = 0;
    for (const word of left) if (right.has(word)) shared += 1;
    return shared / (left.size + right.size - shared);
}

/**
 * Near copies: long questions sharing almost every word, or questions reusing the same
 * numbers with mostly the same words. Short sums ("What is -7 + 3?") only count as copies
 * when both their words and their numbers match.
 */
export function isNearCopy(left: QuestionSignature, right: QuestionSignature): boolean {
    const words = overlap(left.words, right.words);
    const sameNumbers = left.numberCount > 0 && left.numbers === right.numbers;
    if (left.words.size >= 3 && right.words.size >= 3) {
        return words >= 0.85 || (sameNumbers && left.numberCount >= 2 && words >= 0.5);
    }
    return sameNumbers && words === 1;
}

/** Index of the first earlier text the candidate nearly copies, or -1. */
export function findNearCopy(candidate: string, earlier: QuestionSignature[]): number {
    const signature = questionSignature(candidate);
    return earlier.findIndex((other) => isNearCopy(signature, other));
}

export const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

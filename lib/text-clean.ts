/**
 * Question text must be exactly what a student should read. Models and imports sometimes leave
 * markdown, LaTeX wrappers, odd spaces or doubled punctuation behind: those are cleaned here.
 * A placeholder box or blank (x + □ = 3) cannot be cleaned, so it is reported and the question
 * is rewritten in words ("Which number makes...") instead.
 */

const ARTIFACTS: Array<[RegExp, string]> = [
    [/[■-▣▫-▭◻-◾☐-☒⬛⬜⎵⎕�]/, "a placeholder box (□)"],
    [/_{3,}/, "a blank (___)"],
    [/\[\s*\]/, "empty brackets [ ]"],
    [/\bfill in the blank\b/i, "a fill-in-the-blank"],
];

export function cleanMathText(value: string): string {
    return value
        .replace(/[​-‍﻿]/g, "")
        .replace(/ /g, " ")
        .replace(/\\\(|\\\)|\\\[|\\\]/g, "")
        .replace(/\$\$?([^$]+)\$\$?/g, "$1")
        .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1/$2")
        .replace(/\\times\b/g, "×")
        .replace(/\\div\b/g, "÷")
        .replace(/\\cdot\b/g, "·")
        .replace(/\\leq?\b/g, "≤")
        .replace(/\\geq?\b/g, "≥")
        .replace(/\\neq?\b/g, "≠")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\?{2,}/g, "?")
        .replace(/[ \t]+/g, " ")
        .replace(/ +([,.?!;:])/g, "$1")
        .trim();
}

/** What makes a text unfit to show, after cleaning. */
export function findTextArtifacts(...texts: string[]): string[] {
    const combined = texts.join("\n");
    return ARTIFACTS.filter(([pattern]) => pattern.test(combined)).map(([, label]) => label);
}

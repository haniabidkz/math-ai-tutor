/**
 * Rule A: examples must come from local daily life. These words point at a foreign setting
 * and have to be rewritten (Rupees, kilometres, Celsius, cricket) before approval.
 *
 * Kept deliberately narrow to avoid false alarms: feet and inches are common in Pakistan,
 * and "per cent" is ordinary British-style spelling.
 */
const FOREIGN_TERMS: Array<[RegExp, string]> = [
    [/\$\s?\d|\d\s?\$/, "dollar sign ($)"],
    [/\bdollars?\b/i, "dollars"],
    [/£|\bpounds?\b/i, "pounds"],
    [/€|\beuros?\b/i, "euros"],
    [/\bmiles?\b/i, "miles"],
    [/\bgallons?\b/i, "gallons"],
    [/\bfahrenheit\b|°\s?F\b/i, "Fahrenheit"],
    [/\bpenn(?:y|ies)\b|\bpence\b|\bnickels?\b|\bdimes?\b/i, "US or UK coins"],
    [/\bbaseball\b|\bsoftball\b|\bquarterback\b|\bsuper ?bowl\b|\bNFL\b|\bNBA\b/i, "American sports"],
    [/\bthanksgiving\b|\bhalloween\b/i, "foreign holidays"],
];

export function findForeignContext(...texts: string[]): string[] {
    const combined = texts.join("\n");
    return FOREIGN_TERMS.filter(([pattern]) => pattern.test(combined)).map(([, label]) => label);
}

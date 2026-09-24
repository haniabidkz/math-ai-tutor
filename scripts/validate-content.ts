import { MICRO_CONCEPTS } from "../lib/curriculum";
import { validateContentBank, validateDiagnosticTests } from "../lib/content-validation";
import { ALL_DIAGNOSTIC_QUESTIONS } from "../lib/diagnostic-questions";
import { QUESTION_BANK } from "../lib/question-bank";

const result = validateContentBank(MICRO_CONCEPTS, [...QUESTION_BANK, ...ALL_DIAGNOSTIC_QUESTIONS]);
const diagnosticErrors = validateDiagnosticTests();
console.log(`Concepts: ${result.conceptCount}`);
console.log(`Questions: ${result.questionCount} (${ALL_DIAGNOSTIC_QUESTIONS.length} diagnostic)`);
const errors = [...result.errors, ...diagnosticErrors];
if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
}
console.log("Content bank is valid.");

import { validateContentBank } from "../lib/content-validation";

const result = validateContentBank();
console.log(`Concepts: ${result.conceptCount}`);
console.log(`Questions: ${result.questionCount}`);
if (!result.valid) {
    console.error(result.errors.join("\n"));
    process.exit(1);
}
console.log("Content bank is valid.");

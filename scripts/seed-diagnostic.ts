import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "../lib/firebase-admin";
import { validateDiagnosticTests } from "../lib/content-validation";
import { getConcept } from "../lib/curriculum";
import { getDiagnosticBlueprint } from "../lib/diagnostic-blueprint";
import { ALL_DIAGNOSTIC_QUESTIONS } from "../lib/diagnostic-questions";
import type { MicroConcept } from "../types/curriculum";

/**
 * Puts the diagnostic tests into Firestore so the Super Admin can see and edit them:
 * the foundation concepts they test (and their prerequisites) and the 45 fixed questions.
 *
 *   npm run seed:diagnostic                 add what is missing, keep anything already stored
 *   npm run seed:diagnostic -- --reset      also overwrite stored questions with the built-in text
 *   npm run seed:diagnostic -- --dry-run    only report what would change
 */
const dryRun = process.argv.includes("--dry-run");
const reset = process.argv.includes("--reset");

function conceptsWithPrerequisites(): MicroConcept[] {
    const found = new Map<string, MicroConcept>();
    const tags = [6, 7, 8].flatMap((classLevel) => getDiagnosticBlueprint(classLevel as 6 | 7 | 8).map((topic) => topic.microTag));
    for (const tag of tags) {
        let cursor: string | null = tag;
        while (cursor && !found.has(cursor)) {
            const concept = getConcept(cursor);
            if (!concept) throw new Error(`Unknown concept ${cursor}`);
            found.set(cursor, concept);
            cursor = concept.prerequisiteTag;
        }
    }
    return [...found.values()];
}

async function main() {
    const errors = validateDiagnosticTests();
    if (errors.length) throw new Error(`Diagnostic content is invalid:\n${errors.join("\n")}`);

    const concepts = conceptsWithPrerequisites();
    const conceptSnapshots = await adminDb.getAll(...concepts.map((concept) => adminDb.collection("microConcepts").doc(concept.microTag)));
    const missingConcepts = concepts.filter((_, index) => !conceptSnapshots[index].exists);

    const questionSnapshots = await adminDb.getAll(...ALL_DIAGNOSTIC_QUESTIONS.map((question) => adminDb.collection("questions").doc(question.id)));
    const questionsToWrite = ALL_DIAGNOSTIC_QUESTIONS.filter((_, index) => reset || !questionSnapshots[index].exists);

    console.log(`Concepts to add: ${missingConcepts.map((concept) => concept.microTag).join(", ") || "none"}`);
    console.log(`Questions to ${reset ? "write" : "add"}: ${questionsToWrite.length} of ${ALL_DIAGNOSTIC_QUESTIONS.length}`);
    if (dryRun) return console.log("Dry run: nothing written.");

    const batch = adminDb.batch();
    for (const concept of missingConcepts) {
        batch.set(adminDb.collection("microConcepts").doc(concept.microTag), {
            ...concept,
            createdBy: "seed-diagnostic",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    }
    for (const question of questionsToWrite) {
        const { id, ...data } = question;
        batch.set(adminDb.collection("questions").doc(id), {
            ...data,
            createdBy: "seed-diagnostic",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
    }
    if (missingConcepts.length || questionsToWrite.length) {
        batch.set(adminDb.collection("auditLogs").doc(), {
            actorUid: "seed-diagnostic",
            actorEmail: "system",
            action: "diagnostic.seed",
            targetType: "diagnostic",
            targetId: "class6,class7,class8",
            summary: `Loaded the new diagnostic tests: ${questionsToWrite.length} questions, ${missingConcepts.length} foundation concepts`,
            createdAt: FieldValue.serverTimestamp(),
        });
    }
    await batch.commit();
    console.log("Done.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

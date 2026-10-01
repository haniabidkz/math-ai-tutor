import "dotenv/config";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { MICRO_CONCEPTS } from "../lib/curriculum";
import { DEFAULT_ASSESSMENT_CONFIG } from "../types/curriculum";
import { validateContentBank } from "../lib/content-validation";

const app = getApps()[0] ?? initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
});
const db = getFirestore(app);

async function commitInBatches<T extends object>(collection: string, records: Array<{ id: string; data: T }>) {
    for (let start = 0; start < records.length; start += 400) {
        const batch = db.batch();
        for (const record of records.slice(start, start + 400)) {
            batch.set(db.collection(collection).doc(record.id), {
                ...record.data,
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        await batch.commit();
    }
}

async function main() {
    const validation = validateContentBank();
    if (!validation.valid) {
        console.error(validation.errors.join("\n"));
        process.exit(1);
    }

    await commitInBatches("microConcepts", MICRO_CONCEPTS.map((concept) => ({ id: concept.microTag, data: concept })));
    // The template question bank is never written to the database: practice questions come only
    // from AI Studio pools or the Super Admin, and the diagnostic tests from seed:diagnostic.
    await db.collection("assessmentConfigs").doc("default").set({
        ...DEFAULT_ASSESSMENT_CONFIG,
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`Seeded ${validation.conceptCount} micro-concepts and the assessment settings. No practice questions were written.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

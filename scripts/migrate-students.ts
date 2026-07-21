import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const app = getApps()[0] ?? initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
});
const db = getFirestore(app);

async function main() {
    const snapshot = await db.collection("students").get();
    const batch = db.batch();
    let migrated = 0;
    for (const student of snapshot.docs) {
        const current = Number(student.data().class);
        const next = current < 6 ? 6 : current > 8 ? 8 : current;
        if (current !== next) {
            batch.set(student.ref, { class: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            migrated += 1;
        }
    }
    if (migrated) await batch.commit();
    console.log(`Migrated ${migrated} of ${snapshot.size} student profiles.`);
}

main().catch((error) => { console.error(error); process.exit(1); });

/**
 * Seed Script for Math AI Tutor
 *
 * Creates 3 demo student accounts, 2 parents (each linked to a student),
 * and 1 teacher account with rich sample data for testing all dashboards.
 *
 * Run with: npm run seed
 *
 * Demo Credentials:
 *   student1@demo.com / Demo@1234  →  Ali Ahmed      (Class 5, Level 2)  Parent: parent1@demo.com
 *   student2@demo.com / Demo@1234  →  Sara Malik     (Class 7, Level 3)  Parent: parent1@demo.com  ← same parent, 2 kids
 *   student3@demo.com / Demo@1234  →  Hamza Qureshi  (Class 3, Level 1)  Parent: parent2@demo.com
 *   parent1@demo.com  / Demo@1234  →  Fatima Ahmed   (linked to Ali + Sara)
 *   parent2@demo.com  / Demo@1234  →  Zara Qureshi   (linked to Hamza)
 *   teacher@demo.com  / Demo@1234  →  Ms. Sarah Khan
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const app =
    getApps().length === 0
        ? initializeApp({
              credential: cert({
                  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
                  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
                  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
              }),
          })
        : getApps()[0];

const adminAuth = getAuth(app);
const db = getFirestore(app);

// ─── Helpers ─────────────────────────────────────────────────────

const DEMO_PASSWORD = "Demo@1234";

async function getOrCreateUser(email: string, displayName: string): Promise<string> {
    try {
        const existing = await adminAuth.getUserByEmail(email);
        console.log(`  ✓ User exists: ${email} (${existing.uid})`);
        return existing.uid;
    } catch (err: any) {
        if (err.code === "auth/user-not-found") {
            const u = await adminAuth.createUser({
                email,
                password: DEMO_PASSWORD,
                displayName,
                emailVerified: true,
            });
            console.log(`  + Created: ${email} (${u.uid})`);
            return u.uid;
        }
        throw err;
    }
}

/** Milliseconds offset for fake timestamps */
function daysAgo(n: number) {
    return Timestamp.fromDate(new Date(Date.now() - n * 86_400_000));
}

// ─── STUDENT 1 ── Ali Ahmed ── Class 5 ── Level 2 ────────────────

async function seedStudent1(uid: string) {
    const ref = db.collection("students").doc(uid);

    await ref.set(
        {
            uid,
            name: "Ali Ahmed",
            email: "student1@demo.com",
            role: "student",
            class: 5,
            parentEmail: "parent1@demo.com",
            adaptive_level: 2,
            placementCompleted: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    // Adaptive state
    await ref.collection("studentProgress").doc("adaptiveState").set({
        uid,
        adaptive_level: 2,
        correct_streak: 1,
        wrong_streak: 0,
        placementCompleted: true,
        last_level_change: "up",
        updatedAt: FieldValue.serverTimestamp(),
    });

    // Topic Progress
    const topics = [
        {
            topicId: "class5_topic0",
            topicName: "Fractions & Decimals",
            classLevel: 5,
            teachingLevel: 1,
            teachingAttempts: 1,
            needsHumanAttention: false,
            understood: true,
            understandingLevel: "EXCELLENT",
            quizCompleted: true,
            quizScore: 5,
            quizMaxScore: 5,
            previousExplanations: ["Fractions are like slicing a pizza into equal pieces..."],
            completedAt: daysAgo(10),
            updatedAt: daysAgo(10),
        },
        {
            topicId: "class5_topic1",
            topicName: "Percentage Basics",
            classLevel: 5,
            teachingLevel: 2,
            teachingAttempts: 2,
            needsHumanAttention: false,
            understood: true,
            understandingLevel: "GOOD",
            quizCompleted: true,
            quizScore: 4,
            quizMaxScore: 5,
            previousExplanations: [
                "Percentage means 'out of 100'...",
                "Sochein ke aap ke paas 100 toffees hain...",
            ],
            completedAt: daysAgo(7),
            updatedAt: daysAgo(7),
        },
        {
            topicId: "class5_topic2",
            topicName: "Geometry",
            classLevel: 5,
            teachingLevel: 2,
            teachingAttempts: 2,
            needsHumanAttention: false,
            understood: false,
            understandingLevel: "AVERAGE",
            quizCompleted: true,
            quizScore: 3,
            quizMaxScore: 5,
            previousExplanations: ["Geometry is the study of shapes...", "Let me try with daily life examples..."],
            updatedAt: daysAgo(4),
        },
        {
            topicId: "class5_topic3",
            topicName: "Data Handling",
            classLevel: 5,
            teachingLevel: 3,
            teachingAttempts: 3,
            needsHumanAttention: true,
            understood: false,
            previousExplanations: [
                "Data handling means collecting information...",
                "Data handling ka matlab hai information collect karna...",
                "Once upon a time, a group of friends decided to count birds...",
            ],
            updatedAt: daysAgo(2),
        },
    ];

    for (const t of topics) {
        await ref.collection("topicProgress").doc(t.topicId).set(t, { merge: true });
    }
    console.log(`  ✓ ${topics.length} topic progress records`);

    // Quiz Results
    const quizResults = [
        {
            sessionId: "quiz_ali_fractions_1",
            studentUid: uid,
            topicId: "class5_topic0",
            topicName: "Fractions & Decimals",
            score: 5,
            maxScore: 5,
            percentage: 100,
            totalHintsUsed: 0,
            totalTimeSeconds: 120,
            understandingLevel: "EXCELLENT",
            feedback: "Excellent understanding of Fractions & Decimals!",
            completedAt: daysAgo(10),
        },
        {
            sessionId: "quiz_ali_percentage_1",
            studentUid: uid,
            topicId: "class5_topic1",
            topicName: "Percentage Basics",
            score: 4,
            maxScore: 5,
            percentage: 80,
            totalHintsUsed: 1,
            totalTimeSeconds: 180,
            understandingLevel: "GOOD",
            feedback: "Good understanding of Percentage Basics.",
            completedAt: daysAgo(7),
        },
        {
            sessionId: "quiz_ali_geometry_1",
            studentUid: uid,
            topicId: "class5_topic2",
            topicName: "Geometry",
            score: 3,
            maxScore: 5,
            percentage: 60,
            totalHintsUsed: 2,
            totalTimeSeconds: 240,
            understandingLevel: "AVERAGE",
            feedback: "Partial understanding of Geometry. Some concepts need reinforcement.",
            completedAt: daysAgo(4),
        },
    ];

    for (const qr of quizResults) {
        await ref.collection("quizResults").doc(qr.sessionId).set(qr, { merge: true });
    }
    console.log(`  ✓ ${quizResults.length} quiz results`);
}

// ─── STUDENT 2 ── Sara Malik ── Class 7 ── Level 3 ───────────────

async function seedStudent2(uid: string) {
    const ref = db.collection("students").doc(uid);

    await ref.set(
        {
            uid,
            name: "Sara Malik",
            email: "student2@demo.com",
            role: "student",
            class: 7,
            parentEmail: "parent1@demo.com",
            adaptive_level: 3,
            placementCompleted: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    await ref.collection("studentProgress").doc("adaptiveState").set({
        uid,
        adaptive_level: 3,
        correct_streak: 2,
        wrong_streak: 0,
        placementCompleted: true,
        last_level_change: "up",
        updatedAt: FieldValue.serverTimestamp(),
    });

    const topics = [
        {
            topicId: "class7_topic0",
            topicName: "Algebraic Expressions",
            classLevel: 7,
            teachingLevel: 1,
            teachingAttempts: 1,
            needsHumanAttention: false,
            understood: true,
            understandingLevel: "EXCELLENT",
            quizCompleted: true,
            quizScore: 5,
            quizMaxScore: 5,
            previousExplanations: ["Algebra uses letters like x and y to represent numbers..."],
            completedAt: daysAgo(14),
            updatedAt: daysAgo(14),
        },
        {
            topicId: "class7_topic1",
            topicName: "Linear Equations",
            classLevel: 7,
            teachingLevel: 1,
            teachingAttempts: 1,
            needsHumanAttention: false,
            understood: true,
            understandingLevel: "GOOD",
            quizCompleted: true,
            quizScore: 4,
            quizMaxScore: 5,
            previousExplanations: ["A linear equation is like a balance scale..."],
            completedAt: daysAgo(9),
            updatedAt: daysAgo(9),
        },
        {
            topicId: "class7_topic2",
            topicName: "Triangles",
            classLevel: 7,
            teachingLevel: 2,
            teachingAttempts: 2,
            needsHumanAttention: false,
            understood: false,
            understandingLevel: "AVERAGE",
            quizCompleted: true,
            quizScore: 3,
            quizMaxScore: 5,
            previousExplanations: ["Triangles have 3 sides and 3 angles...", "Let's use the Pythagoras example..."],
            updatedAt: daysAgo(3),
        },
        {
            topicId: "class7_topic3",
            topicName: "Probability",
            classLevel: 7,
            teachingLevel: 1,
            teachingAttempts: 1,
            needsHumanAttention: false,
            understood: false,
            previousExplanations: ["Probability tells us how likely something is to happen..."],
            updatedAt: daysAgo(1),
        },
    ];

    for (const t of topics) {
        await ref.collection("topicProgress").doc(t.topicId).set(t, { merge: true });
    }
    console.log(`  ✓ ${topics.length} topic progress records`);

    const quizResults = [
        {
            sessionId: "quiz_sara_algebra_1",
            studentUid: uid,
            topicId: "class7_topic0",
            topicName: "Algebraic Expressions",
            score: 5,
            maxScore: 5,
            percentage: 100,
            totalHintsUsed: 0,
            totalTimeSeconds: 95,
            understandingLevel: "EXCELLENT",
            feedback: "Excellent! Sara understands algebraic expressions perfectly.",
            completedAt: daysAgo(14),
        },
        {
            sessionId: "quiz_sara_linear_1",
            studentUid: uid,
            topicId: "class7_topic1",
            topicName: "Linear Equations",
            score: 4,
            maxScore: 5,
            percentage: 80,
            totalHintsUsed: 1,
            totalTimeSeconds: 150,
            understandingLevel: "GOOD",
            feedback: "Good grasp of Linear Equations. More practice recommended.",
            completedAt: daysAgo(9),
        },
        {
            sessionId: "quiz_sara_triangles_1",
            studentUid: uid,
            topicId: "class7_topic2",
            topicName: "Triangles",
            score: 3,
            maxScore: 5,
            percentage: 60,
            totalHintsUsed: 3,
            totalTimeSeconds: 310,
            understandingLevel: "AVERAGE",
            feedback: "Partial understanding of Triangles.",
            completedAt: daysAgo(3),
        },
    ];

    for (const qr of quizResults) {
        await ref.collection("quizResults").doc(qr.sessionId).set(qr, { merge: true });
    }
    console.log(`  ✓ ${quizResults.length} quiz results`);
}

// ─── STUDENT 3 ── Hamza Qureshi ── Class 3 ── Level 1 ────────────

async function seedStudent3(uid: string) {
    const ref = db.collection("students").doc(uid);

    await ref.set(
        {
            uid,
            name: "Hamza Qureshi",
            email: "student3@demo.com",
            role: "student",
            class: 3,
            parentEmail: "parent2@demo.com",
            adaptive_level: 1,
            placementCompleted: true,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );

    await ref.collection("studentProgress").doc("adaptiveState").set({
        uid,
        adaptive_level: 1,
        correct_streak: 0,
        wrong_streak: 1,
        placementCompleted: true,
        last_level_change: "down",
        updatedAt: FieldValue.serverTimestamp(),
    });

    const topics = [
        {
            topicId: "class3_topic0",
            topicName: "Multiplication Tables",
            classLevel: 3,
            teachingLevel: 1,
            teachingAttempts: 1,
            needsHumanAttention: false,
            understood: true,
            understandingLevel: "GOOD",
            quizCompleted: true,
            quizScore: 4,
            quizMaxScore: 5,
            previousExplanations: ["Multiplication is like repeated addition..."],
            completedAt: daysAgo(12),
            updatedAt: daysAgo(12),
        },
        {
            topicId: "class3_topic1",
            topicName: "Division Basics",
            classLevel: 3,
            teachingLevel: 2,
            teachingAttempts: 2,
            needsHumanAttention: false,
            understood: false,
            understandingLevel: "AVERAGE",
            quizCompleted: true,
            quizScore: 2,
            quizMaxScore: 5,
            previousExplanations: [
                "Division is the opposite of multiplication...",
                "Imagine sharing 12 cookies among 3 friends...",
            ],
            updatedAt: daysAgo(6),
        },
        {
            topicId: "class3_topic2",
            topicName: "Fractions Introduction",
            classLevel: 3,
            teachingLevel: 3,
            teachingAttempts: 3,
            needsHumanAttention: true,
            understood: false,
            previousExplanations: [
                "A fraction is a part of a whole...",
                "Ek pizza ko barabar tukdon mein kaato...",
                "Imagine a chocolate bar with 4 pieces...",
            ],
            updatedAt: daysAgo(1),
        },
        {
            topicId: "class3_topic3",
            topicName: "Money",
            classLevel: 3,
            teachingLevel: 1,
            teachingAttempts: 1,
            needsHumanAttention: false,
            understood: false,
            previousExplanations: ["Money helps us buy things we need..."],
            updatedAt: daysAgo(0),
        },
    ];

    for (const t of topics) {
        await ref.collection("topicProgress").doc(t.topicId).set(t, { merge: true });
    }
    console.log(`  ✓ ${topics.length} topic progress records`);

    const quizResults = [
        {
            sessionId: "quiz_hamza_multiplication_1",
            studentUid: uid,
            topicId: "class3_topic0",
            topicName: "Multiplication Tables",
            score: 4,
            maxScore: 5,
            percentage: 80,
            totalHintsUsed: 1,
            totalTimeSeconds: 200,
            understandingLevel: "GOOD",
            feedback: "Hamza has a good understanding of Multiplication Tables!",
            completedAt: daysAgo(12),
        },
        {
            sessionId: "quiz_hamza_division_1",
            studentUid: uid,
            topicId: "class3_topic1",
            topicName: "Division Basics",
            score: 2,
            maxScore: 5,
            percentage: 40,
            totalHintsUsed: 4,
            totalTimeSeconds: 480,
            understandingLevel: "WEAK",
            feedback: "Hamza is still learning Division Basics and needs more support.",
            completedAt: daysAgo(6),
        },
    ];

    for (const qr of quizResults) {
        await ref.collection("quizResults").doc(qr.sessionId).set(qr, { merge: true });
    }
    console.log(`  ✓ ${quizResults.length} quiz results`);
}

// ─── PARENT 1 ── Fatima Ahmed ── linked to Ali + Sara ────────────

async function seedParent1(uid: string, student1Uid: string, student2Uid: string) {
    await db
        .collection("parents")
        .doc(uid)
        .set(
            {
                uid,
                name: "Fatima Ahmed",
                email: "parent1@demo.com",
                role: "parent",
                linkedStudents: [student1Uid, student2Uid],
                createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
    console.log("  ✓ Parent1 profile (linked to Ali + Sara)");
}

// ─── PARENT 2 ── Zara Qureshi ── linked to Hamza ─────────────────

async function seedParent2(uid: string, student3Uid: string) {
    await db
        .collection("parents")
        .doc(uid)
        .set(
            {
                uid,
                name: "Zara Qureshi",
                email: "parent2@demo.com",
                role: "parent",
                linkedStudents: [student3Uid],
                createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
    console.log("  ✓ Parent2 profile (linked to Hamza)");
}

// ─── TEACHER ── Ms. Sarah Khan ────────────────────────────────────

async function seedTeacher(uid: string) {
    await db
        .collection("teachers")
        .doc(uid)
        .set(
            {
                uid,
                name: "Ms. Sarah Khan",
                email: "teacher@demo.com",
                role: "teacher",
                assignedClasses: [3, 4, 5, 6, 7],
                createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
        );
    console.log("  ✓ Teacher profile (Classes 3–7)");
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
    console.log("\n🌱 Seeding Math AI Tutor — Rich Demo Data\n");
    console.log("─".repeat(56));

    // ── Students ──
    console.log("\n📚 Student 1 — Ali Ahmed (Class 5, Level 2):");
    const s1uid = await getOrCreateUser("student1@demo.com", "Ali Ahmed");
    await seedStudent1(s1uid);

    console.log("\n📚 Student 2 — Sara Malik (Class 7, Level 3):");
    const s2uid = await getOrCreateUser("student2@demo.com", "Sara Malik");
    await seedStudent2(s2uid);

    console.log("\n📚 Student 3 — Hamza Qureshi (Class 3, Level 1):");
    const s3uid = await getOrCreateUser("student3@demo.com", "Hamza Qureshi");
    await seedStudent3(s3uid);

    // ── Parents ──
    console.log("\n👩‍👧‍👦 Parent 1 — Fatima Ahmed (Ali + Sara):");
    const p1uid = await getOrCreateUser("parent1@demo.com", "Fatima Ahmed");
    await seedParent1(p1uid, s1uid, s2uid);

    console.log("\n👩‍👦 Parent 2 — Zara Qureshi (Hamza):");
    const p2uid = await getOrCreateUser("parent2@demo.com", "Zara Qureshi");
    await seedParent2(p2uid, s3uid);

    // ── Teacher ──
    console.log("\n👩‍🏫 Teacher — Ms. Sarah Khan:");
    const tuid = await getOrCreateUser("teacher@demo.com", "Ms. Sarah Khan");
    await seedTeacher(tuid);

    // ── Summary ──
    console.log("\n" + "─".repeat(56));
    console.log("\n✅ Seeding complete!\n");
    console.log("  ┌────────────┬──────────────────────────┬────────────┐");
    console.log("  │ Role       │ Email                    │ Password   │");
    console.log("  ├────────────┼──────────────────────────┼────────────┤");
    console.log("  │ Student 1  │ student1@demo.com        │ Demo@1234  │");
    console.log("  │ Student 2  │ student2@demo.com        │ Demo@1234  │");
    console.log("  │ Student 3  │ student3@demo.com        │ Demo@1234  │");
    console.log("  │ Parent 1   │ parent1@demo.com         │ Demo@1234  │");
    console.log("  │ Parent 2   │ parent2@demo.com         │ Demo@1234  │");
    console.log("  │ Teacher    │ teacher@demo.com         │ Demo@1234  │");
    console.log("  └────────────┴──────────────────────────┴────────────┘");
    console.log("\n  Relationships:");
    console.log("  parent1@demo.com  → Ali Ahmed (Class 5) + Sara Malik (Class 7)");
    console.log("  parent2@demo.com  → Hamza Qureshi (Class 3)");
    console.log("  teacher@demo.com  → sees all students (Classes 3–7)");
    console.log("\n  Login URLs:");
    console.log("  Student:  http://localhost:3000/login?role=student");
    console.log("  Parent:   http://localhost:3000/login?role=parent");
    console.log("  Teacher:  http://localhost:3000/login?role=teacher\n");

    process.exit(0);
}

main().catch((err) => {
    console.error("\n❌ Seed failed:", err.message || err);
    process.exit(1);
});

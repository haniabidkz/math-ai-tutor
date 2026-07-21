import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore, Timestamp, type DocumentData, type DocumentReference } from "firebase-admin/firestore";
import {
    assertDemoAccountRelationships,
    DEMO_ACCOUNT_PASSWORD,
    DEMO_PARENTS,
    DEMO_STUDENTS,
    DEMO_TEACHER,
} from "../lib/demo-accounts";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const adminEmail = process.env.SUPER_ADMIN_EMAIL ?? "admin@mathaitutor.com";
const adminPassword = process.env.SUPER_ADMIN_PASSWORD;
const demoPassword = process.env.DEMO_ACCOUNT_PASSWORD ?? DEMO_ACCOUNT_PASSWORD;

if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase Admin environment is incomplete");
if (!adminPassword) throw new Error("SUPER_ADMIN_PASSWORD is required and is never stored in source control");

const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth(app);
const db = getFirestore(app);

type Role = "student" | "parent" | "teacher" | "super_admin";

const progressByClass = {
    6: [
        { id: "c6-integers-intro", percentage: 100, mastered: true },
        { id: "c6-positive-numbers", percentage: 85, mastered: true },
        { id: "c6-negative-numbers", percentage: 50, mastered: false },
    ],
    7: [
        { id: "c7-variable-constant-isolation", percentage: 95, mastered: true },
        { id: "c7-term-segmentation", percentage: 80, mastered: true },
        { id: "c7-coefficients", percentage: 40, mastered: false },
    ],
    8: [
        { id: "c8-equation-revision", percentage: 90, mastered: true },
        { id: "c8-one-two-step-systems", percentage: 55, mastered: false },
        { id: "c8-ratio-basics", percentage: 75, mastered: true },
    ],
} as const;

const topicsByClass = {
    6: [
        { id: "class6-integers", name: "Integers", understood: true, level: "EXCELLENT" },
        { id: "class6-algebra-intro", name: "Introduction to Algebra", understood: false, level: "AVERAGE" },
    ],
    7: [
        { id: "class7-algebraic-expressions", name: "Algebraic Expressions", understood: true, level: "GOOD" },
        { id: "class7-linear-equations", name: "Linear Equations", understood: false, level: "AVERAGE" },
    ],
    8: [
        { id: "class8-linear-equations", name: "Linear Equations", understood: true, level: "GOOD" },
        { id: "class8-ratio-proportion", name: "Ratio and Proportion", understood: false, level: "AVERAGE" },
    ],
} as const;

async function ensureUser(email: string, displayName: string, password: string, role: Role): Promise<UserRecord> {
    let user: UserRecord;
    try {
        user = await auth.getUserByEmail(email);
        user = await auth.updateUser(user.uid, { displayName, password, emailVerified: true, disabled: false });
    } catch (error) {
        if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
        user = await auth.createUser({ email, displayName, password, emailVerified: true });
    }

    const { super_admin: _superAdmin, ...claims } = user.customClaims ?? {};
    await auth.setCustomUserClaims(user.uid, role === "super_admin"
        ? { ...claims, role, super_admin: true }
        : { ...claims, role });
    await auth.revokeRefreshTokens(user.uid);
    return auth.getUser(user.uid);
}

async function replaceCollection(parent: DocumentReference, name: string, documents: Array<{ id: string; data: DocumentData }>) {
    const collection = parent.collection(name);
    const existing = await collection.get();
    const batch = db.batch();
    existing.docs.forEach((document) => batch.delete(document.ref));
    documents.forEach((document) => batch.set(collection.doc(document.id), document.data));
    await batch.commit();
}

async function provisionStudent(student: (typeof DEMO_STUDENTS)[number], uid: string) {
    const studentRef = db.collection("students").doc(uid);
    const existing = await studentRef.get();
    const progress = progressByClass[student.classLevel];
    const mastered = progress.filter((item) => item.mastered).map((item) => item.id);

    await studentRef.set({
        uid,
        name: student.name,
        email: student.email,
        role: "student",
        class: student.classLevel,
        parentEmail: student.parentEmail,
        adaptive_level: student.adaptiveLevel,
        placementCompleted: true,
        diagnosticCompleted: true,
        diagnosticProfile: { strongMicroTags: mastered, weakMicroTags: progress.filter((item) => !item.mastered).map((item) => item.id) },
        nextWeeklyAssessmentAt: Timestamp.fromDate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
        ...(!existing.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await replaceCollection(studentRef, "conceptProgress", progress.map((item) => ({
        id: item.id,
        data: { microTag: item.id, percentage: item.percentage, mastered: item.mastered, updatedAt: FieldValue.serverTimestamp() },
    })));

    const topics = topicsByClass[student.classLevel];
    await replaceCollection(studentRef, "topicProgress", topics.map((topic, index) => ({
        id: topic.id,
        data: {
            topicId: topic.id,
            topicName: topic.name,
            classLevel: student.classLevel,
            teachingLevel: index + 1,
            teachingAttempts: index + 1,
            needsHumanAttention: !topic.understood,
            understood: topic.understood,
            understandingLevel: topic.level,
            updatedAt: Timestamp.fromDate(new Date(Date.now() - (index + 1) * 24 * 60 * 60 * 1000)),
        },
    })));

    await replaceCollection(studentRef, "quizResults", topics.map((topic, index) => {
        const percentage = index === 0 ? 90 : 60;
        return {
            id: `demo-${topic.id}`,
            data: {
                sessionId: `demo-${topic.id}`,
                studentUid: uid,
                topicId: topic.id,
                topicName: topic.name,
                score: percentage / 10,
                maxScore: 10,
                percentage,
                totalHintsUsed: index,
                totalTimeSeconds: 180 + index * 90,
                understandingLevel: topic.level,
                feedback: index === 0 ? "Strong understanding shown in this topic." : "Continue practicing this topic.",
                completedAt: Timestamp.fromDate(new Date(Date.now() - (index + 2) * 24 * 60 * 60 * 1000)),
            },
        };
    }));
}

async function main() {
    assertDemoAccountRelationships();
    const studentUids = new Map<string, string>();

    for (const student of DEMO_STUDENTS) {
        const user = await ensureUser(student.email, student.name, demoPassword, "student");
        studentUids.set(student.email, user.uid);
        await provisionStudent(student, user.uid);
        console.log(`Provisioned student ${student.email} in Class ${student.classLevel}.`);
    }

    for (const parent of DEMO_PARENTS) {
        const user = await ensureUser(parent.email, parent.name, demoPassword, "parent");
        const profile = db.collection("parents").doc(user.uid);
        const existing = await profile.get();
        await profile.set({
            uid: user.uid,
            name: parent.name,
            email: parent.email,
            role: "parent",
            linkedStudents: parent.studentEmails.map((email) => studentUids.get(email)),
            ...(!existing.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        console.log(`Provisioned parent ${parent.email} with ${parent.studentEmails.length} linked student(s).`);
    }

    const teacher = await ensureUser(DEMO_TEACHER.email, DEMO_TEACHER.name, demoPassword, "teacher");
    const teacherRef = db.collection("teachers").doc(teacher.uid);
    const existingTeacher = await teacherRef.get();
    await teacherRef.set({
        uid: teacher.uid,
        name: DEMO_TEACHER.name,
        email: DEMO_TEACHER.email,
        role: "teacher",
        assignedClasses: DEMO_TEACHER.assignedClasses,
        ...(!existingTeacher.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`Provisioned teacher ${DEMO_TEACHER.email}.`);

    const admin = await ensureUser(adminEmail, "Math AI Tutor Administrator", adminPassword!, "super_admin");
    const adminRef = db.collection("admins").doc(admin.uid);
    const existingAdmin = await adminRef.get();
    await adminRef.set({
        uid: admin.uid,
        name: "Math AI Tutor Administrator",
        email: adminEmail,
        role: "super_admin",
        ...(!existingAdmin.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`Provisioned Super Admin ${adminEmail}.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

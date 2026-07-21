import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const describeRules = emulatorAvailable ? describe : describe.skip;
let environment: RulesTestEnvironment;

describeRules("Firestore security rules", () => {
    beforeAll(async () => {
        const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(":");
        environment = await initializeTestEnvironment({
            projectId: "math-ai-tutor-rules-test",
            firestore: {
                host,
                port: Number(port),
                rules: fs.readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8"),
            },
        });
    });

    beforeEach(async () => {
        await environment.clearFirestore();
        await environment.withSecurityRulesDisabled(async (context) => {
            await setDoc(doc(context.firestore(), "students/student-a"), { email: "student@example.com", parentEmail: "parent@example.com" });
            await setDoc(doc(context.firestore(), "students/student-b"), { email: "other@example.com" });
            await setDoc(doc(context.firestore(), "students/student-a/topicProgress/progress-a"), { understood: true });
            await setDoc(doc(context.firestore(), "parents/parent-a"), { email: "parent@example.com" });
            await setDoc(doc(context.firestore(), "teachers/teacher-a"), { email: "teacher@example.com" });
            await setDoc(doc(context.firestore(), "questions/question-a"), { status: "published" });
        });
    });

    afterAll(async () => environment.cleanup());

    it("blocks unverified users from published content", async () => {
        const db = environment.authenticatedContext("student-a", { email: "student@example.com", email_verified: false }).firestore();
        await assertFails(getDoc(doc(db, "questions/question-a")));
    });

    it("allows a verified student to read only their own profile", async () => {
        const db = environment.authenticatedContext("student-a", { email: "student@example.com", email_verified: true }).firestore();
        await assertSucceeds(getDoc(doc(db, "students/student-a")));
        await assertFails(getDoc(doc(db, "students/student-b")));
    });

    it("allows a linked parent to read the child and progress", async () => {
        const db = environment.authenticatedContext("parent-a", { email: "parent@example.com", email_verified: true }).firestore();
        await assertSucceeds(getDoc(doc(db, "students/student-a")));
        await assertSucceeds(getDoc(doc(db, "students/student-a/topicProgress/progress-a")));
        await assertFails(getDoc(doc(db, "students/student-b")));
    });

    it("allows a verified teacher to read students without granting writes", async () => {
        const db = environment.authenticatedContext("teacher-a", { email: "teacher@example.com", email_verified: true }).firestore();
        await assertSucceeds(getDocs(collection(db, "students")));
        await assertFails(setDoc(doc(db, "students/student-a"), { name: "Changed" }, { merge: true }));
    });

    it("allows only a verified super admin to write question content", async () => {
        const studentDb = environment.authenticatedContext("student-a", { email: "student@example.com", email_verified: true }).firestore();
        const adminDb = environment.authenticatedContext("admin-a", { email: "admin@example.com", email_verified: true, super_admin: true }).firestore();
        await assertFails(setDoc(doc(studentDb, "questions/question-b"), { status: "published" }));
        await assertSucceeds(setDoc(doc(adminDb, "questions/question-b"), { status: "published" }));
        expect((await getDoc(doc(adminDb, "questions/question-b"))).exists()).toBe(true);
    });
});

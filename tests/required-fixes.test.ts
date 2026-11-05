import { describe, expect, it } from "vitest";
import { sessionXp } from "@/lib/assessment-session";
import { participationAwardId, XP_FIRST_ATTEMPT_CORRECT, XP_QUIZ_COMPLETED } from "@/lib/gamification";
import { mostImproved } from "@/lib/leaderboard";
import { nextOfflineQuestion, replayVerdict } from "@/lib/offline-queue";
import { firstIssue, managedStudentSchema, parseStudentImport, signupSchema } from "@/lib/schools";

describe("sign-up with a mobile number or an email", () => {
    const base = { role: "student", name: "Ali Ahmed", password: "secret1", classLevel: 6 };

    it("accepts a phone alone, an email alone, or both", () => {
        expect(signupSchema.parse({ ...base, phone: "03001234567" })).toMatchObject({ phone: "+923001234567", email: null });
        expect(signupSchema.parse({ ...base, email: "Ali@Example.com" })).toMatchObject({ phone: null, email: "ali@example.com" });
        expect(signupSchema.parse({ ...base, phone: "03001234567", email: "ali@example.com" })).toMatchObject({ phone: "+923001234567", email: "ali@example.com" });
    });

    it("refuses a sign-up with neither, and still checks what is given", () => {
        expect(firstIssue(signupSchema.safeParse({ ...base }).error)).toContain("mobile number or an email");
        expect(firstIssue(signupSchema.safeParse({ ...base, phone: "", email: "" }).error)).toContain("mobile number or an email");
        expect(firstIssue(signupSchema.safeParse({ ...base, phone: "0300" }).error)).toContain("valid mobile number");
        expect(firstIssue(signupSchema.safeParse({ ...base, email: "not-an-email" }).error)).toContain("valid email");
        expect(signupSchema.safeParse({ role: "teacher", name: "Ms Khan", password: "secret1", email: "khan@example.com" }).success).toBe(true);
    });

    it("lets a school add a student with an email instead of a phone", () => {
        expect(managedStudentSchema.parse({ name: "Sara Malik", email: "sara@example.com", classLevel: 7 })).toMatchObject({ phone: null, email: "sara@example.com" });
        expect(managedStudentSchema.safeParse({ name: "Sara Malik", classLevel: 7 }).success).toBe(false);
    });

    it("imports a row whose phone column holds an email, and rejects a row with neither", () => {
        const parsed = parseStudentImport("Ali Ahmed,ali@example.com,6\nSara Malik,,7\nBilal Khan,03001234567,8");
        expect(parsed.rows[0]).toMatchObject({ phone: "", email: "ali@example.com", error: null });
        expect(parsed.rows[1].error).toBe("Add a mobile number or an email");
        expect(parsed.rows[2]).toMatchObject({ phone: "+923001234567", error: null });
        expect(parsed.valid).toBe(2);
    });
});

describe("leaderboard: one participation award a day and the most improved student", () => {
    const answers = [
        { isCorrect: true, hintUsed: false }, { isCorrect: true, hintUsed: true }, { isCorrect: false }, { isCorrect: true, practice: true },
    ] as never;

    it("gives the points for taking part only while today's award is still open", () => {
        expect(sessionXp({ answers })).toBe(XP_QUIZ_COMPLETED + XP_FIRST_ATTEMPT_CORRECT);
        expect(sessionXp({ answers }, { participation: false })).toBe(XP_FIRST_ATTEMPT_CORRECT);
        expect(participationAwardId("2026-11-05")).toBe("participation__2026-11-05");
    });

    it("picks the biggest rise over last week among students who played both weeks", () => {
        const current = [
            { uid: "a", name: "Ali", points: 120, correctAnswers: 10 },
            { uid: "b", name: "Sara", points: 90, correctAnswers: 8 },
            { uid: "c", name: "New", points: 300, correctAnswers: 25 },
            { uid: "d", name: "Down", points: 10, correctAnswers: 1 },
        ];
        const previous = [{ uid: "a", points: 100 }, { uid: "b", points: 20 }, { uid: "d", points: 60 }];
        expect(mostImproved(current, previous)).toEqual({ uid: "b", name: "Sara", points: 90, previousPoints: 20, gain: 70 });
        expect(mostImproved(current, [])).toBeNull();
        expect(mostImproved([{ uid: "d", name: "Down", points: 10, correctAnswers: 1 }], previous)).toBeNull();
    });

    it("breaks a tie on the gain by the higher score", () => {
        const current = [{ uid: "a", name: "Ali", points: 50, correctAnswers: 4 }, { uid: "b", name: "Sara", points: 80, correctAnswers: 6 }];
        expect(mostImproved(current, [{ uid: "a", points: 20 }, { uid: "b", points: 50 }])?.uid).toBe("b");
    });
});

describe("offline quiz", () => {
    const questions = [{ id: "q1" }, { id: "q2" }, { id: "q3" }, { id: "q4" }];

    it("never offers a question already shown, online or offline", () => {
        expect(nextOfflineQuestion(questions, ["q1", "q3"], { questionNumber: 2, totalQuestions: 10 })?.id).toBe("q2");
        expect(nextOfflineQuestion(questions, ["q1", "q2", "q3", "q4"], { questionNumber: 4, totalQuestions: 10 })).toBeNull();
    });

    it("stops at the quiz's own number of questions even when more are held", () => {
        expect(nextOfflineQuestion(questions, ["q1"], { questionNumber: 3, totalQuestions: 3 })).toBeNull();
    });

    it("keeps a queued answer while the server is busy or a review comes first, and drops one that can never apply", () => {
        expect(replayVerdict(200)).toEqual({ ok: true, retryable: false });
        expect(replayVerdict(503)).toEqual({ ok: false, retryable: true });
        expect(replayVerdict(409, "remediation_pending")).toEqual({ ok: false, retryable: true });
        expect(replayVerdict(409, "stale_question")).toEqual({ ok: false, retryable: false });
        expect(replayVerdict(401)).toEqual({ ok: false, retryable: true });
    });
});

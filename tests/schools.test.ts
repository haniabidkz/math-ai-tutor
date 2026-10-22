import { describe, expect, it } from "vitest";
import {
    firstIssue, generatePassword, managedStudentSchema, normalizeSchoolCode, parseClassCell, parseStudentImport, planPromotion,
    schoolCodeFor, schoolCodePrefix, schoolInputSchema, sectionInputSchema, sectionLabel, signupSchema,
} from "@/lib/schools";

describe("school codes", () => {
    it("builds a code from the school's name", () => {
        expect(schoolCodePrefix("Eagle Public School")).toBe("EAGLE");
        expect(schoolCodePrefix("Al Noor Academy")).toBe("ALNOOR");
        expect(schoolCodePrefix("The International School of Karachi")).toBe("INTERNAT");
        expect(schoolCodePrefix("A1")).toBe("ACH");
        expect(schoolCodeFor("Eagle Public School", 6)).toBe("EAGLE-6");
    });

    it("normalises what students type", () => {
        expect(normalizeSchoolCode(" eagle 6 ")).toBe("EAGLE-6");
        expect(normalizeSchoolCode("EAGLE—6")).toBe("EAGLE-6");
        expect(sectionLabel(6, " a ")).toBe("6-A");
    });
});

describe("request schemas", () => {
    it("requires a phone and a class for a student sign-up and normalises both", () => {
        const parsed = signupSchema.parse({ role: "student", name: "Ali Ahmed", phone: "0300-1234567", password: "secret1", classLevel: "6", schoolCode: "eagle 6", email: "" });
        expect(parsed).toMatchObject({ phone: "+923001234567", classLevel: 6, schoolCode: "EAGLE-6", email: null, parentEmail: null, parentPhone: null });
        expect(firstIssue(signupSchema.safeParse({ role: "student", name: "Ali", phone: "0300", password: "secret1", classLevel: 6 }).error)).toContain("valid mobile number");
        expect(firstIssue(signupSchema.safeParse({ role: "student", name: "Ali", phone: "03001234567", password: "secret1" }).error)).toContain("Choose a class");
        expect(firstIssue(signupSchema.safeParse({ role: "teacher", name: "Ms Khan", phone: "03001234567", password: "secret1", schoolCode: "EAGLE-6" }).error)).toContain("added by the school");
    });

    it("validates a new school with its first admin", () => {
        const parsed = schoolInputSchema.parse({ name: "Eagle Public School", admin: { name: "Mr Raza", phone: "03111234567", password: "admin123" } });
        expect(parsed.plan).toBe("trial");
        expect(parsed.admin.phone).toBe("+923111234567");
        expect(schoolInputSchema.safeParse({ name: "E", admin: { name: "Mr Raza", phone: "03111234567", password: "admin123" } }).success).toBe(false);
    });

    it("validates sections and managed students", () => {
        expect(sectionInputSchema.parse({ classLevel: "7", name: " blue " })).toEqual({ classLevel: 7, name: "BLUE" });
        expect(sectionInputSchema.safeParse({ classLevel: 9, name: "A" }).success).toBe(false);
        const student = managedStudentSchema.parse({ name: "Sara Malik", phone: "03001234568", classLevel: 6, password: "" });
        expect(student.password).toBeNull();
        expect(student.sectionId).toBeNull();
        expect(managedStudentSchema.safeParse({ name: "Sara Malik", phone: "03001234568", classLevel: 6, password: "123" }).success).toBe(false);
    });
});

describe("annual promotion", () => {
    const sections = [
        { id: "s6a", classLevel: 6, name: "A" },
        { id: "s7a", classLevel: 7, name: "A" },
        { id: "s7b", classLevel: 7, name: "B" },
        { id: "s8a", classLevel: 8, name: "A" },
    ];
    const students = [
        { uid: "u1", classLevel: 6, sectionId: "s6a" },
        { uid: "u2", classLevel: 6, sectionId: "s6a" },
        { uid: "u3", classLevel: 7, sectionId: "s7b" },
        { uid: "u4", classLevel: 8, sectionId: "s8a" },
        { uid: "u5", classLevel: 7, sectionId: null },
        { uid: "u6", classLevel: 8, sectionId: "s8a", schoolStatus: "graduated" },
        { uid: "u7", classLevel: 9, sectionId: null },
    ];

    it("moves every class up, keeps section names, graduates the top class and creates missing sections", () => {
        const plan = planPromotion(sections, students);
        expect(plan.moves).toEqual([
            { uid: "u1", fromClass: 6, toClass: 7, toSectionName: "A" },
            { uid: "u2", fromClass: 6, toClass: 7, toSectionName: "A" },
            { uid: "u3", fromClass: 7, toClass: 8, toSectionName: "B" },
            { uid: "u5", fromClass: 7, toClass: 8, toSectionName: null },
        ]);
        expect(plan.graduates).toEqual(["u4"]);
        expect(plan.sectionsToCreate).toEqual([{ classLevel: 8, name: "B" }]);
        expect(plan.skipped).toBe(1);
        expect(plan.summary).toEqual([
            { from: "6-A", to: "7-A", students: 2 },
            { from: "7-B", to: "8-B", students: 1 },
            { from: "8-A", to: "Graduated", students: 1 },
            { from: "Class 7", to: "Class 8", students: 1 },
        ]);
    });
});

describe("bulk import", () => {
    it("reads rows with or without a header, in comma or tab form", () => {
        const withHeader = parseStudentImport("Name,Phone,Class,Section,Password,Parent phone\nAli Ahmed,03001234567,6,A,,03009876543\nSara Malik,0300-1234568,Class 7,B,pass123,");
        expect(withHeader.valid).toBe(2);
        expect(withHeader.rows[0]).toMatchObject({ line: 2, name: "Ali Ahmed", phone: "+923001234567", classLevel: 6, section: "A", password: null, parentPhone: "+923009876543", error: null });
        expect(withHeader.rows[1]).toMatchObject({ name: "Sara Malik", classLevel: 7, section: "B", password: "pass123", parentPhone: null });

        const tabs = parseStudentImport("Hamza Qureshi\t03001234569\t8-C");
        expect(tabs.rows[0]).toMatchObject({ name: "Hamza Qureshi", classLevel: 8, section: "C", error: null });
    });

    it("explains each bad row and keeps the good ones", () => {
        const parsed = parseStudentImport("A,03001234567,6\nAli Ahmed,0300,6\nAli Ahmed,03001234567,9\nAli Ahmed,03001234567,6,A,123");
        expect(parsed.valid).toBe(0);
        expect(parsed.rows.map((row) => row.error)).toEqual(["Name is missing", "Phone number is not valid", "Class must be 6, 7, 8", "Password must be at least 6 characters"]);
        expect(parseClassCell("Class 6")).toEqual({ classLevel: 6, section: null });
        expect(parseClassCell("6 A")).toEqual({ classLevel: 6, section: "A" });
        expect(parseClassCell("six")).toEqual({ classLevel: null, section: null });
    });

    it("makes passwords a teacher can read out", () => {
        expect(generatePassword(() => 0)).toBe("Tiger1000");
        expect(generatePassword(() => 0.999)).toMatch(/^[A-Z][a-z]+\d{4}$/);
    });
});

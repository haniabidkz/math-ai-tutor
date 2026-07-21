import { describe, expect, it } from "vitest";
import {
    assertDemoAccountRelationships,
    DEMO_ACCOUNT_PASSWORD,
    DEMO_PARENTS,
    DEMO_STUDENTS,
    DEMO_TEACHER,
} from "@/lib/demo-accounts";

describe("demo account specification", () => {
    it("keeps every student linked to exactly one parent and covered by the teacher", () => {
        expect(assertDemoAccountRelationships).not.toThrow();
        expect(DEMO_STUDENTS.map((student) => student.classLevel)).toEqual([6, 7, 8]);
        expect(DEMO_PARENTS.flatMap((parent) => parent.studentEmails)).toHaveLength(DEMO_STUDENTS.length);
        expect(DEMO_TEACHER.assignedClasses).toEqual([6, 7, 8]);
    });

    it("uses the documented password for all non-admin demo accounts", () => {
        expect(DEMO_ACCOUNT_PASSWORD).toBe("Demo@1234");
    });
});

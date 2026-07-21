import type { StudentClassLevel } from "@/types/curriculum";

export const DEMO_ACCOUNT_PASSWORD = "Demo@1234";

export const DEMO_STUDENTS = [
    { email: "student1@demo.com", name: "Ali Ahmed", classLevel: 6, parentEmail: "parent1@demo.com", adaptiveLevel: 4 },
    { email: "student2@demo.com", name: "Sara Malik", classLevel: 7, parentEmail: "parent1@demo.com", adaptiveLevel: 5 },
    { email: "student3@demo.com", name: "Hamza Qureshi", classLevel: 8, parentEmail: "parent2@demo.com", adaptiveLevel: 2 },
] as const satisfies ReadonlyArray<{
    email: string;
    name: string;
    classLevel: StudentClassLevel;
    parentEmail: string;
    adaptiveLevel: 1 | 2 | 3 | 4 | 5;
}>;

export const DEMO_PARENTS = [
    { email: "parent1@demo.com", name: "Fatima Ahmed", studentEmails: ["student1@demo.com", "student2@demo.com"] },
    { email: "parent2@demo.com", name: "Zara Qureshi", studentEmails: ["student3@demo.com"] },
] as const;

export const DEMO_TEACHER = {
    email: "teacher@demo.com",
    name: "Ms. Sarah Khan",
    assignedClasses: [6, 7, 8] as StudentClassLevel[],
};

export function assertDemoAccountRelationships() {
    const studentsByEmail = new Map(DEMO_STUDENTS.map((student) => [student.email, student]));
    const linkedStudents = new Set<string>();

    for (const parent of DEMO_PARENTS) {
        for (const studentEmail of parent.studentEmails) {
            const student = studentsByEmail.get(studentEmail);
            if (!student) throw new Error(`${parent.email} links an unknown student: ${studentEmail}`);
            if (student.parentEmail !== parent.email) throw new Error(`${studentEmail} does not point back to ${parent.email}`);
            if (linkedStudents.has(studentEmail)) throw new Error(`${studentEmail} is linked to more than one demo parent`);
            linkedStudents.add(studentEmail);
        }
    }

    for (const student of DEMO_STUDENTS) {
        if (!linkedStudents.has(student.email)) throw new Error(`${student.email} has no linked demo parent`);
        if (!DEMO_TEACHER.assignedClasses.includes(student.classLevel)) {
            throw new Error(`${DEMO_TEACHER.email} is not assigned to Class ${student.classLevel}`);
        }
    }
}

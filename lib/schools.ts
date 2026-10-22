import { z } from "zod";
import { normalizePhone } from "@/lib/phone";

/**
 * Pure school rules: supported classes, school codes, section labels, the request schemas
 * the school and super-admin APIs validate, the annual promotion planner and the bulk
 * import parser. Nothing here touches Firestore.
 */

/** Classes with curriculum and diagnostics today; adding Class 9 is one entry here plus content. */
export const SUPPORTED_SCHOOL_CLASSES = [6, 7, 8] as const;
export type SchoolClassLevel = (typeof SUPPORTED_SCHOOL_CLASSES)[number];

export function isSchoolClass(value: unknown): value is SchoolClassLevel {
    return (SUPPORTED_SCHOOL_CLASSES as readonly number[]).includes(Number(value));
}

export const SCHOOL_CODE_PATTERN = /^[A-Z]{3,8}-\d{1,4}$/;
export const MAX_IMPORT_ROWS = 500;

/** "eagle 6", " Eagle-6 " and "EAGLE—6" all mean EAGLE-6. */
export function normalizeSchoolCode(input: string | null | undefined): string {
    return String(input ?? "").trim().toUpperCase().replace(/[\s_–—]+/g, "-").replace(/-+/g, "-");
}

export function isValidSchoolCode(code: string): boolean {
    return SCHOOL_CODE_PATTERN.test(code);
}

/** The letters a code starts with: the school's first word, filled from the next words when short. */
export function schoolCodePrefix(name: string): string {
    const all = name.toUpperCase().split(/[^A-Z]+/).filter(Boolean);
    const meaningful = all.filter((word) => !["THE", "A", "AN", "OF"].includes(word));
    const words = meaningful.length ? meaningful : all;
    let prefix = "";
    for (const word of words) {
        if (prefix.length >= 3) break;
        prefix += word;
    }
    prefix = prefix.slice(0, 8);
    while (prefix.length < 3) prefix += "SCH".charAt(prefix.length);
    return prefix;
}

export function schoolCodeFor(name: string, number: number): string {
    return `${schoolCodePrefix(name)}-${number}`;
}

export function normalizeSectionName(input: string): string {
    return input.trim().toUpperCase().replace(/\s+/g, " ");
}

export function sectionLabel(classLevel: number, name: string): string {
    return `${classLevel}-${normalizeSectionName(name)}`;
}

const nameField = z.string().trim().min(2, "Enter the full name").max(80, "The name is too long");
const passwordField = z.string().min(6, "The password must be at least 6 characters").max(100);
const optionalPassword = z.string().max(100).optional().transform((value) => (value && value.length ? value : null))
    .refine((value) => value === null || value.length >= 6, { message: "The password must be at least 6 characters" });

const phoneField = z.string().trim().transform((value, context) => {
    const phone = normalizePhone(value);
    if (!phone) {
        context.addIssue({ code: "custom", message: "Enter a valid mobile number, like 03001234567" });
        return z.NEVER;
    }
    return phone;
});

const optionalPhone = z.string().trim().optional().transform((value, context) => {
    if (!value) return null;
    const phone = normalizePhone(value);
    if (!phone) {
        context.addIssue({ code: "custom", message: "Enter a valid mobile number, like 03001234567" });
        return z.NEVER;
    }
    return phone;
});

const optionalEmail = z.string().trim().optional().transform((value, context) => {
    if (!value) return null;
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        context.addIssue({ code: "custom", message: "Enter a valid email address" });
        return z.NEVER;
    }
    return email;
});

const classField = z.coerce.number().refine(isSchoolClass, { message: `Class must be ${SUPPORTED_SCHOOL_CLASSES.join(", ")}` });
const optionalClass = z.coerce.number().optional().refine((value) => value === undefined || isSchoolClass(value), { message: `Class must be ${SUPPORTED_SCHOOL_CLASSES.join(", ")}` });
const optionalId = z.string().trim().max(120).optional().transform((value) => (value ? value : null));
const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-31");

/** Public sign-up: a phone is required, an email is optional; a school code links a student to a school. */
export const signupSchema = z.object({
    role: z.enum(["student", "parent", "teacher"]),
    name: nameField,
    phone: phoneField,
    email: optionalEmail,
    password: passwordField,
    classLevel: optionalClass,
    parentEmail: optionalEmail,
    parentPhone: optionalPhone,
    schoolCode: z.string().trim().max(20).optional().transform((value) => (value ? normalizeSchoolCode(value) : null)),
}).superRefine((value, context) => {
    if (value.role === "student" && !value.classLevel) context.addIssue({ code: "custom", message: "Choose a class", path: ["classLevel"] });
    if (value.schoolCode && !isValidSchoolCode(value.schoolCode)) context.addIssue({ code: "custom", message: "A school code looks like EAGLE-6", path: ["schoolCode"] });
    if (value.role !== "student" && value.schoolCode) context.addIssue({ code: "custom", message: "Teachers and parents are added by the school, not by code", path: ["schoolCode"] });
});
export type SignupInput = z.infer<typeof signupSchema>;

export const schoolAdminInputSchema = z.object({ name: nameField, phone: phoneField, email: optionalEmail, password: passwordField });

export const schoolInputSchema = z.object({
    name: z.string().trim().min(2, "Enter the school name").max(80),
    city: z.string().trim().max(60).optional().default(""),
    contactName: z.string().trim().max(80).optional().default(""),
    contactPhone: optionalPhone,
    contactEmail: optionalEmail,
    seatLimit: z.coerce.number().int().min(1).max(100000).optional(),
    trialDays: z.coerce.number().int().min(1).max(365).optional(),
    plan: z.enum(["trial", "paid"]).optional().default("trial"),
    notes: z.string().trim().max(500).optional().default(""),
    admin: schoolAdminInputSchema,
});
export type SchoolInput = z.infer<typeof schoolInputSchema>;

export const schoolUpdateSchema = z.object({
    name: z.string().trim().min(2).max(80).optional(),
    city: z.string().trim().max(60).optional(),
    contactName: z.string().trim().max(80).optional(),
    contactPhone: optionalPhone,
    contactEmail: optionalEmail,
    seatLimit: z.coerce.number().int().min(1).max(100000).optional(),
    plan: z.enum(["trial", "paid", "expired"]).optional(),
    trialEndsAt: dateField.nullable().optional(),
    paidUntil: dateField.nullable().optional(),
    trialFullAccess: z.boolean().optional(),
    status: z.enum(["active", "suspended"]).optional(),
    notes: z.string().trim().max(500).optional(),
});
export type SchoolUpdate = z.infer<typeof schoolUpdateSchema>;

export const sectionInputSchema = z.object({
    classLevel: classField,
    name: z.string().trim().min(1, "Give the section a name, like A").max(20).transform(normalizeSectionName)
        .refine((value) => /^[A-Z0-9][A-Z0-9 -]*$/.test(value), { message: "Section names use letters, numbers, spaces and dashes" }),
});

export const managedStudentSchema = z.object({
    name: nameField,
    phone: phoneField,
    email: optionalEmail,
    password: optionalPassword,
    classLevel: classField,
    sectionId: optionalId,
    parentPhone: optionalPhone,
    parentEmail: optionalEmail,
});
export type ManagedStudentInput = z.infer<typeof managedStudentSchema>;

export const studentUpdateSchema = z.object({
    name: nameField.optional(),
    classLevel: optionalClass,
    sectionId: z.string().trim().max(120).nullable().optional(),
    parentPhone: optionalPhone,
    parentEmail: optionalEmail,
});

export const managedTeacherSchema = z.object({
    name: nameField,
    phone: phoneField,
    email: optionalEmail,
    password: optionalPassword,
    sectionIds: z.array(z.string().trim().min(1)).max(50).default([]),
});
export type ManagedTeacherInput = z.infer<typeof managedTeacherSchema>;

export const teacherUpdateSchema = z.object({
    name: nameField.optional(),
    sectionIds: z.array(z.string().trim().min(1)).max(50).optional(),
});

/** Generic member actions shared by the school and super-admin panels. */
export const memberActionSchema = z.object({
    action: z.enum(["suspend", "unsuspend", "resetPassword", "remove"]),
    password: optionalPassword,
});

export const promotionInputSchema = z.object({
    confirmCode: z.string().trim().transform(normalizeSchoolCode),
    askDiagnosticAgain: z.boolean().optional().default(true),
    force: z.boolean().optional().default(false),
});

/** The first zod issue, as one plain sentence for the screen. */
export function firstIssue(error: unknown, fallback = "Check the form and try again"): string {
    const issues = (error as { issues?: Array<{ message?: string; path?: Array<string | number> }> }).issues;
    const issue = issues?.[0];
    if (!issue) return error instanceof Error && error.message ? error.message : fallback;
    const path = issue.path?.length ? `${String(issue.path[issue.path.length - 1])}: ` : "";
    return `${path}${issue.message ?? fallback}`;
}

// ---------------------------------------------------------------------------------------------
// Annual promotion

export interface PromotableSection {
    id: string;
    classLevel: number;
    name: string;
}

export interface PromotableStudent {
    uid: string;
    classLevel: number;
    sectionId: string | null;
    schoolStatus?: string | null;
}

export interface PromotionMove {
    uid: string;
    fromClass: number;
    toClass: number;
    /** The section name to keep ("A" of 6-A becomes "A" of 7-A); null when the student had none. */
    toSectionName: string | null;
}

export interface PromotionPlan {
    moves: PromotionMove[];
    /** Class 8 students: their class has no next year here, so they graduate and keep their data. */
    graduates: string[];
    sectionsToCreate: Array<{ classLevel: number; name: string }>;
    summary: Array<{ from: string; to: string; students: number }>;
    /** Students in classes this curriculum does not cover; they are left alone. */
    skipped: number;
}

const highestClass = Math.max(...SUPPORTED_SCHOOL_CLASSES);

/** Everyone moves one class up; the top class graduates; sections keep their names. */
export function planPromotion(sections: PromotableSection[], students: PromotableStudent[]): PromotionPlan {
    const byId = new Map(sections.map((section) => [section.id, section]));
    const exists = new Set(sections.map((section) => `${section.classLevel}-${normalizeSectionName(section.name)}`));
    const toCreate = new Map<string, { classLevel: number; name: string }>();
    const counts = new Map<string, number>();
    const moves: PromotionMove[] = [];
    const graduates: string[] = [];
    let skipped = 0;

    const count = (from: string, to: string) => counts.set(`${from}→${to}`, (counts.get(`${from}→${to}`) ?? 0) + 1);

    for (const student of students) {
        if (student.schoolStatus === "graduated") continue;
        if (!isSchoolClass(student.classLevel)) { skipped += 1; continue; }
        const section = student.sectionId ? byId.get(student.sectionId) ?? null : null;
        const fromLabel = section ? sectionLabel(student.classLevel, section.name) : `Class ${student.classLevel}`;
        if (student.classLevel === highestClass) {
            graduates.push(student.uid);
            count(fromLabel, "Graduated");
            continue;
        }
        const toClass = student.classLevel + 1;
        const toSectionName = section ? normalizeSectionName(section.name) : null;
        if (toSectionName && !exists.has(`${toClass}-${toSectionName}`)) toCreate.set(`${toClass}-${toSectionName}`, { classLevel: toClass, name: toSectionName });
        moves.push({ uid: student.uid, fromClass: student.classLevel, toClass, toSectionName });
        count(fromLabel, toSectionName ? sectionLabel(toClass, toSectionName) : `Class ${toClass}`);
    }

    return {
        moves,
        graduates,
        sectionsToCreate: [...toCreate.values()].sort((left, right) => left.classLevel - right.classLevel || left.name.localeCompare(right.name)),
        summary: [...counts.entries()].map(([key, students]) => {
            const [from, to] = key.split("→");
            return { from, to, students };
        }).sort((left, right) => left.from.localeCompare(right.from)),
        skipped,
    };
}

// ---------------------------------------------------------------------------------------------
// Bulk import (pasted CSV or a spreadsheet's rows)

export interface ImportedStudentRow {
    line: number;
    name: string;
    phone: string;
    classLevel: number;
    section: string | null;
    password: string | null;
    parentPhone: string | null;
    email: string | null;
    error: string | null;
}

const IMPORT_COLUMNS = ["name", "phone", "class", "section", "password", "parentphone", "email"] as const;
type ImportColumn = (typeof IMPORT_COLUMNS)[number];

function splitLine(line: string): string[] {
    const delimiter = line.includes("\t") ? "\t" : ",";
    const cells: string[] = [];
    let current = "";
    let quoted = false;
    for (const char of line) {
        if (char === "\"") { quoted = !quoted; continue; }
        if (char === delimiter && !quoted) { cells.push(current); current = ""; continue; }
        current += char;
    }
    cells.push(current);
    return cells.map((cell) => cell.trim());
}

function headerColumns(cells: string[]): ImportColumn[] | null {
    const normalized = cells.map((cell) => cell.toLowerCase().replace(/[^a-z]/g, ""));
    if (!normalized.includes("name") || !normalized.includes("phone")) return null;
    return normalized.map((cell) => {
        if (cell === "name" || cell === "studentname" || cell === "fullname") return "name";
        if (cell === "phone" || cell === "mobile" || cell === "phonenumber" || cell === "mobilenumber") return "phone";
        if (cell === "class" || cell === "classlevel" || cell === "grade") return "class";
        if (cell === "section") return "section";
        if (cell === "password") return "password";
        if (cell === "parentphone" || cell === "parentmobile" || cell === "fatherphone" || cell === "guardianphone") return "parentphone";
        if (cell === "email") return "email";
        return "email";
    });
}

/** "6", "Class 6", "6-A" and "6 A" all name a class; a section inside the class cell is kept. */
export function parseClassCell(cell: string): { classLevel: number | null; section: string | null } {
    const match = cell.trim().toUpperCase().match(/^(?:CLASS\s*)?(\d{1,2})(?:\s*[-\s]\s*([A-Z0-9][A-Z0-9 -]*))?$/);
    if (!match) return { classLevel: null, section: null };
    return { classLevel: Number(match[1]), section: match[2] ? normalizeSectionName(match[2]) : null };
}

export function parseStudentImport(text: string): { rows: ImportedStudentRow[]; valid: number; invalid: number; truncated: boolean } {
    const lines = text.split(/\r?\n/).map((line, index) => ({ line: index + 1, text: line.trim() })).filter((item) => item.text);
    let columns: ImportColumn[] = [...IMPORT_COLUMNS];
    if (lines.length) {
        const header = headerColumns(splitLine(lines[0].text));
        if (header) { columns = header; lines.shift(); }
    }
    const truncated = lines.length > MAX_IMPORT_ROWS;
    const rows = lines.slice(0, MAX_IMPORT_ROWS).map(({ line, text }) => {
        const cells = splitLine(text);
        const get = (column: ImportColumn) => {
            const index = columns.indexOf(column);
            return index >= 0 ? (cells[index] ?? "") : "";
        };
        const name = get("name");
        const phone = normalizePhone(get("phone"));
        const classCell = parseClassCell(get("class"));
        const section = get("section") ? normalizeSectionName(get("section")) : classCell.section;
        const password = get("password") || null;
        const parentRaw = get("parentphone");
        const parentPhone = parentRaw ? normalizePhone(parentRaw) : null;
        const email = get("email").toLowerCase() || null;
        let error: string | null = null;
        if (name.length < 2) error = "Name is missing";
        else if (!phone) error = "Phone number is not valid";
        else if (!classCell.classLevel || !isSchoolClass(classCell.classLevel)) error = `Class must be ${SUPPORTED_SCHOOL_CLASSES.join(", ")}`;
        else if (password && password.length < 6) error = "Password must be at least 6 characters";
        else if (parentRaw && !parentPhone) error = "Parent phone is not valid";
        else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) error = "Email is not valid";
        return { line, name, phone: phone ?? "", classLevel: classCell.classLevel ?? 0, section, password, parentPhone, email, error };
    });
    return { rows, valid: rows.filter((row) => !row.error).length, invalid: rows.filter((row) => row.error).length, truncated };
}

const PASSWORD_WORDS = ["Tiger", "Eagle", "River", "Sunny", "Lotus", "Maple", "Delta", "Comet", "Pearl", "Falcon", "Amber", "Cedar", "Ocean", "Zebra"];

/** Easy to read out in a classroom: a word and four digits, like Tiger4821. */
export function generatePassword(random: () => number = Math.random): string {
    const word = PASSWORD_WORDS[Math.floor(random() * PASSWORD_WORDS.length)];
    const digits = String(1000 + Math.floor(random() * 9000));
    return `${word}${digits}`;
}

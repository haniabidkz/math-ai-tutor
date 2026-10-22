import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type DocumentData, type DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import {
    ACCESS_SETTING_LIMITS, effectivePlan, normalizeAccessSettings, resolveStudentAccess, trialDaysLeft,
    type AccessSettings, type PlanState, type SchoolPlanInfo, type StudentAccess,
} from "@/lib/access";
import { boardId, leaderboardWeekKey } from "@/lib/leaderboard";
import { displayContact, isPhoneEmail, phoneToEmail } from "@/lib/phone";
import {
    generatePassword, isSchoolClass, planPromotion, schoolCodeFor, sectionLabel,
    type ImportedStudentRow, type ManagedStudentInput, type ManagedTeacherInput, type SchoolInput, type SchoolUpdate, type SignupInput,
} from "@/lib/schools";
import type { ImportOutcome, School, SchoolAdminRow, SchoolSection, SchoolStudentRow, SchoolTeacherRow } from "@/types/school";

/**
 * Everything the school features write and read on the server: schools and their plans,
 * sections, member accounts (created with a phone sign-in), seats, the annual promotion and
 * the per-school report. Every function takes the school id it is allowed to touch; the
 * routes decide who may call it.
 */

export interface Actor {
    uid: string;
    email: string;
}

export class SchoolError extends Error {
    constructor(public status: number, message: string, public code?: string) {
        super(message);
        this.name = "SchoolError";
    }
}

export const SEAT_LIMIT_CODE = "SEAT_LIMIT_REACHED";
export const PHONE_IN_USE_CODE = "PHONE_IN_USE";
/** A school is promoted once a year; a second run inside this window needs `force`. */
const PROMOTION_COOLDOWN_MS = 180 * 86_400_000;
const CACHE_MS = 15_000;
const BATCH_LIMIT = 400;
const AUTH_LOOKUP_CHUNK = 100;

export function toMillis(value: unknown): number | null {
    if (value && typeof value === "object" && typeof (value as { toMillis?: () => number }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
    }
    return typeof value === "number" ? value : null;
}

/** Midnight at the end of that day in Pakistan (UTC+5), so a date typed by the admin covers the whole day. */
function endOfDayKarachi(date: string): Timestamp {
    const [year, month, day] = date.split("-").map(Number);
    return Timestamp.fromMillis(Date.UTC(year, month - 1, day, 18, 59, 59));
}

const shortId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

// ---------------------------------------------------------------------------------------------
// Platform settings

let settingsCache: { value: AccessSettings; at: number } | null = null;

export async function getAccessSettings(fresh = false): Promise<AccessSettings> {
    if (!fresh && settingsCache && Date.now() - settingsCache.at < CACHE_MS) return settingsCache.value;
    const snapshot = await adminDb.collection("platformSettings").doc("access").get();
    const value = normalizeAccessSettings(snapshot.data());
    settingsCache = { value, at: Date.now() };
    return value;
}

export async function saveAccessSettings(input: Record<string, unknown>, actor: Actor): Promise<AccessSettings> {
    const next: Record<string, number> = {};
    for (const key of Object.keys(ACCESS_SETTING_LIMITS) as Array<keyof AccessSettings>) {
        const { min, max, label } = ACCESS_SETTING_LIMITS[key];
        const value = Number(input[key]);
        if (!Number.isInteger(value) || value < min || value > max) throw new SchoolError(400, `${label} must be a whole number from ${min} to ${max}.`);
        next[key] = value;
    }
    await adminDb.collection("platformSettings").doc("access").set({ ...next, updatedAt: FieldValue.serverTimestamp(), updatedBy: actor.uid }, { merge: true });
    settingsCache = null;
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "settings.access", targetType: "platformSettings", targetId: "access", summary: JSON.stringify(next) });
    return getAccessSettings(true);
}

// ---------------------------------------------------------------------------------------------
// Schools

const schoolCache = new Map<string, { value: School | null; at: number }>();

export function toSchool(id: string, data: DocumentData, now = Date.now()): School {
    const plan: PlanState = data.plan === "paid" ? "paid" : data.plan === "expired" ? "expired" : "trial";
    const trialEndsAt = toMillis(data.trialEndsAt);
    const paidUntil = toMillis(data.paidUntil);
    return {
        id,
        name: String(data.name ?? ""),
        code: String(data.code ?? ""),
        city: String(data.city ?? ""),
        contactName: String(data.contactName ?? ""),
        contactPhone: String(data.contactPhone ?? ""),
        contactEmail: String(data.contactEmail ?? ""),
        plan,
        effectivePlan: effectivePlan({ plan, trialEndsAt, paidUntil }, now),
        trialEndsAt,
        trialDaysLeft: plan === "trial" ? trialDaysLeft(trialEndsAt, now) : 0,
        paidUntil,
        trialFullAccess: data.trialFullAccess === true,
        seatLimit: Number(data.seatLimit ?? 0),
        seatsUsed: Number(data.seatsUsed ?? 0),
        status: data.status === "suspended" ? "suspended" : "active",
        notes: String(data.notes ?? ""),
        createdAt: toMillis(data.createdAt),
        lastPromotedAt: toMillis(data.lastPromotedAt),
    };
}

export function schoolPlanInfo(school: School | null | undefined): SchoolPlanInfo | null {
    if (!school) return null;
    return { plan: school.plan, trialEndsAt: school.trialEndsAt, paidUntil: school.paidUntil, trialFullAccess: school.trialFullAccess, status: school.status };
}

export function forgetSchool(id: string) {
    schoolCache.delete(id);
}

export async function getSchool(id: string, fresh = false): Promise<School | null> {
    if (!id || id.includes("/")) return null;
    const cached = schoolCache.get(id);
    if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
    const snapshot = await adminDb.collection("schools").doc(id).get();
    const value = snapshot.exists ? toSchool(snapshot.id, snapshot.data() ?? {}) : null;
    schoolCache.set(id, { value, at: Date.now() });
    return value;
}

export async function requireSchool(id: string, fresh = false): Promise<School> {
    const school = await getSchool(id, fresh);
    if (!school) throw new SchoolError(404, "School not found");
    return school;
}

export async function listSchools(): Promise<School[]> {
    const snapshot = await adminDb.collection("schools").get();
    const now = Date.now();
    return snapshot.docs.map((doc) => toSchool(doc.id, doc.data(), now)).sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
}

export async function getSchoolByCode(code: string): Promise<School | null> {
    if (!code) return null;
    const snapshot = await adminDb.collection("schoolCodes").doc(code).get();
    const schoolId = snapshot.data()?.schoolId;
    return typeof schoolId === "string" ? getSchool(schoolId) : null;
}

/** The student's effective access, with the school's plan applied. */
export async function accessForStudent(profile: DocumentData, school?: School | null): Promise<StudentAccess> {
    const schoolId = typeof profile.schoolId === "string" && profile.schoolId ? profile.schoolId : null;
    const resolvedSchool = school === undefined ? (schoolId ? await getSchool(schoolId) : null) : school;
    return resolveStudentAccess({ membershipPaid: profile.membership?.paid, schoolId, school: schoolPlanInfo(resolvedSchool), settings: await getAccessSettings() });
}

/** The first free EAGLE-n code for a name; the create transaction re-checks it. */
async function allocateSchoolCode(name: string): Promise<string> {
    for (let number = 1; number <= 999; number += 1) {
        const code = schoolCodeFor(name, number);
        if (!(await adminDb.collection("schoolCodes").doc(code).get()).exists) return code;
    }
    throw new SchoolError(409, "No free school code is left for this name; choose a different name");
}

export async function createSchool(input: SchoolInput, actor: Actor): Promise<{ school: School; admin: { uid: string; password: string | null } }> {
    const settings = await getAccessSettings();
    const id = shortId("sch");
    const trialDays = input.trialDays ?? settings.trialDays;
    const trialEndsAt = Timestamp.fromMillis(Date.now() + trialDays * 86_400_000);

    let code = "";
    for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
        const candidate = await allocateSchoolCode(input.name);
        const written = await adminDb.runTransaction(async (transaction) => {
            const codeRef = adminDb.collection("schoolCodes").doc(candidate);
            if ((await transaction.get(codeRef)).exists) return false;
            transaction.set(codeRef, { schoolId: id, createdAt: FieldValue.serverTimestamp() });
            transaction.set(adminDb.collection("schools").doc(id), {
                name: input.name,
                code: candidate,
                city: input.city ?? "",
                contactName: input.contactName ?? "",
                contactPhone: input.contactPhone ?? "",
                contactEmail: input.contactEmail ?? "",
                plan: input.plan ?? "trial",
                trialEndsAt,
                paidUntil: null,
                trialFullAccess: false,
                seatLimit: input.seatLimit ?? settings.defaultSeatLimit,
                seatsUsed: 0,
                status: "active",
                notes: input.notes ?? "",
                createdBy: actor.uid,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            });
            return true;
        });
        if (written) code = candidate;
    }
    if (!code) throw new SchoolError(409, "The school code could not be reserved; try again");

    let admin: { uid: string; password: string | null };
    try {
        admin = await createManagedUser({ role: "school_admin", schoolId: id, name: input.admin.name, phone: input.admin.phone, email: input.admin.email, password: input.admin.password });
    } catch (error) {
        // Without an admin the school is unusable, so the half-made school goes away again.
        await Promise.all([adminDb.collection("schools").doc(id).delete(), adminDb.collection("schoolCodes").doc(code).delete()]);
        throw error;
    }
    forgetSchool(id);
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.create", targetType: "school", targetId: id, summary: `Created ${input.name} (${code}), ${input.plan ?? "trial"}, ${input.seatLimit ?? settings.defaultSeatLimit} seats` });
    return { school: (await getSchool(id, true))!, admin };
}

export async function updateSchool(id: string, update: Partial<SchoolUpdate>, actor: Actor): Promise<School> {
    const existing = await requireSchool(id, true);
    const settings = await getAccessSettings();
    const patch: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
    const changed: string[] = [];
    for (const key of ["name", "city", "contactName", "seatLimit", "trialFullAccess", "status", "notes"] as const) {
        if (update[key] !== undefined) { patch[key] = update[key]; changed.push(`${key}=${String(update[key])}`); }
    }
    if (update.contactPhone !== undefined) { patch.contactPhone = update.contactPhone ?? ""; changed.push("contactPhone"); }
    if (update.contactEmail !== undefined) { patch.contactEmail = update.contactEmail ?? ""; changed.push("contactEmail"); }
    if (update.plan) {
        patch.plan = update.plan;
        changed.push(`plan=${update.plan}`);
        // Putting a school back on trial starts a fresh trial unless a date is given.
        if (update.plan === "trial" && update.trialEndsAt === undefined && (existing.plan !== "trial" || existing.effectivePlan === "expired")) {
            patch.trialEndsAt = Timestamp.fromMillis(Date.now() + settings.trialDays * 86_400_000);
        }
    }
    if (update.trialEndsAt !== undefined) { patch.trialEndsAt = update.trialEndsAt ? endOfDayKarachi(update.trialEndsAt) : null; changed.push(`trialEndsAt=${update.trialEndsAt ?? "none"}`); }
    if (update.paidUntil !== undefined) { patch.paidUntil = update.paidUntil ? endOfDayKarachi(update.paidUntil) : null; changed.push(`paidUntil=${update.paidUntil ?? "none"}`); }
    if (update.seatLimit !== undefined && update.seatLimit < existing.seatsUsed) {
        throw new SchoolError(400, `The seat limit cannot be below the ${existing.seatsUsed} seats in use`);
    }
    await adminDb.collection("schools").doc(id).set(patch, { merge: true });
    forgetSchool(id);
    if (update.status === "suspended") await revokeSchoolSessions(id);
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.update", targetType: "school", targetId: id, summary: changed.join(", ") || "no change" });
    return (await getSchool(id, true))!;
}

/** Signs every member of a suspended school out, so their next request is refused. */
async function revokeSchoolSessions(schoolId: string) {
    const members = await Promise.all(["students", "teachers", "schoolAdmins"].map((collection) =>
        adminDb.collection(collection).where("schoolId", "==", schoolId).select().get()));
    const uids = members.flatMap((snapshot) => snapshot.docs.map((doc) => doc.id));
    await Promise.all(uids.map((uid) => adminAuth.revokeRefreshTokens(uid).catch(() => undefined)));
}

// ---------------------------------------------------------------------------------------------
// Accounts

export type ManagedRole = "student" | "parent" | "teacher" | "school_admin";

export const ROLE_COLLECTION: Record<ManagedRole, "students" | "parents" | "teachers" | "schoolAdmins"> = {
    student: "students",
    parent: "parents",
    teacher: "teachers",
    school_admin: "schoolAdmins",
};

export interface CreateUserInput {
    role: ManagedRole;
    name: string;
    phone: string;
    email: string | null;
    password: string | null;
    schoolId: string | null;
    profile?: DocumentData;
}

/**
 * One account: Firebase Auth (phone sign-in email + password, the phone itself kept unique by
 * Firebase), the role claim and the role document. Returns the password only when it was generated.
 */
export async function createManagedUser(input: CreateUserInput): Promise<{ uid: string; password: string | null; signInEmail: string }> {
    const password = input.password ?? generatePassword();
    const signInEmail = phoneToEmail(input.phone);
    let uid: string;
    try {
        const record = await adminAuth.createUser({ email: signInEmail, phoneNumber: input.phone, password, displayName: input.name, emailVerified: false });
        uid = record.uid;
    } catch (error) {
        const code = String((error as { code?: string }).code ?? "");
        if (code === "auth/phone-number-already-exists" || code === "auth/email-already-exists") {
            throw new SchoolError(409, "This phone number already has an account. Sign in instead, or use another number.", PHONE_IN_USE_CODE);
        }
        if (code === "auth/invalid-phone-number") throw new SchoolError(400, "Enter a valid mobile number, like 03001234567");
        if (code === "auth/invalid-password") throw new SchoolError(400, "The password must be at least 6 characters");
        throw error;
    }
    await adminAuth.setCustomUserClaims(uid, { role: input.role, ...(input.schoolId ? { schoolId: input.schoolId } : {}) });
    await adminDb.collection(ROLE_COLLECTION[input.role]).doc(uid).set({
        uid,
        name: input.name,
        email: input.email ?? "",
        phone: input.phone,
        role: input.role,
        schoolId: input.schoolId ?? null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        ...(input.profile ?? {}),
    });
    return { uid, password: input.password ? null : password, signInEmail };
}

async function reserveSeat(schoolId: string): Promise<void> {
    await adminDb.runTransaction(async (transaction) => {
        const ref = adminDb.collection("schools").doc(schoolId);
        const data = (await transaction.get(ref)).data();
        if (!data) throw new SchoolError(404, "School not found");
        if (data.status === "suspended") throw new SchoolError(409, "This school is suspended; new students cannot join");
        const used = Number(data.seatsUsed ?? 0);
        const limit = Number(data.seatLimit ?? 0);
        if (used >= limit) throw new SchoolError(409, `The school has used all ${limit} of its seats. Ask the platform admin to add seats.`, SEAT_LIMIT_CODE);
        transaction.update(ref, { seatsUsed: used + 1, updatedAt: FieldValue.serverTimestamp() });
    });
    forgetSchool(schoolId);
}

async function releaseSeat(schoolId: string): Promise<void> {
    await adminDb.runTransaction(async (transaction) => {
        const ref = adminDb.collection("schools").doc(schoolId);
        const data = (await transaction.get(ref)).data();
        if (!data) return;
        transaction.update(ref, { seatsUsed: Math.max(0, Number(data.seatsUsed ?? 0) - 1), updatedAt: FieldValue.serverTimestamp() });
    });
    forgetSchool(schoolId);
}

export async function recountSeats(schoolId: string): Promise<number> {
    const snapshot = await adminDb.collection("students").where("schoolId", "==", schoolId).select("schoolStatus").get();
    const used = snapshot.docs.filter((doc) => doc.data().schoolStatus !== "graduated").length;
    await adminDb.collection("schools").doc(schoolId).set({ seatsUsed: used, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    forgetSchool(schoolId);
    return used;
}

async function sectionOrThrow(schoolId: string, sectionId: string, classLevel?: number): Promise<SchoolSection> {
    const snapshot = await adminDb.collection("schools").doc(schoolId).collection("sections").doc(sectionId).get();
    const data = snapshot.data();
    if (!data) throw new SchoolError(404, "Section not found in this school");
    if (data.active === false) throw new SchoolError(409, `Section ${data.label} is closed`);
    if (classLevel !== undefined && Number(data.classLevel) !== classLevel) throw new SchoolError(400, `Section ${data.label} is a Class ${data.classLevel} section`);
    return toSection(snapshot.id, data, 0);
}

export interface EnrollInput extends ManagedStudentInput {
    schoolId: string;
    source: "code" | "admin" | "teacher" | "import";
}

/** A new student account inside a school: takes a seat, then creates the account; a failure gives the seat back. */
export async function enrollStudent(input: EnrollInput, actor: Actor | null): Promise<{ uid: string; password: string | null; sectionLabel: string | null }> {
    const section = input.sectionId ? await sectionOrThrow(input.schoolId, input.sectionId, input.classLevel) : null;
    await reserveSeat(input.schoolId);
    let created: Awaited<ReturnType<typeof createManagedUser>>;
    try {
        created = await createManagedUser({
            role: "student",
            schoolId: input.schoolId,
            name: input.name,
            phone: input.phone,
            email: input.email,
            password: input.password,
            profile: {
                class: input.classLevel,
                sectionId: section?.id ?? null,
                sectionLabel: section?.label ?? null,
                parentEmail: input.parentEmail ?? null,
                parentPhone: input.parentPhone ?? null,
                schoolStatus: "active",
                enrolledAt: FieldValue.serverTimestamp(),
                enrollmentSource: input.source,
                ...(actor ? { enrolledBy: actor.uid } : {}),
            },
        });
    } catch (error) {
        await releaseSeat(input.schoolId).catch(() => undefined);
        throw error;
    }
    if (actor) {
        await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.student.add", targetType: "student", targetId: created.uid, summary: `Added ${input.name} to Class ${input.classLevel}${section ? ` (${section.label})` : ""} in school ${input.schoolId} (${input.source})` });
    }
    return { uid: created.uid, password: created.password, sectionLabel: section?.label ?? null };
}

/** Public sign-up for students, parents and teachers; a school code enrols the student. */
export async function signUp(input: SignupInput): Promise<{ uid: string; role: ManagedRole; schoolId: string | null; schoolName: string | null }> {
    if (input.role === "student") {
        if (input.schoolCode) {
            const school = await getSchoolByCode(input.schoolCode);
            if (!school) throw new SchoolError(404, "That school code was not found. Check it with your school, or leave it blank.");
            const result = await enrollStudent({
                schoolId: school.id, source: "code", name: input.name, phone: input.phone, email: input.email, password: input.password,
                classLevel: input.classLevel as 6 | 7 | 8, sectionId: null, parentEmail: input.parentEmail, parentPhone: input.parentPhone,
            }, null);
            return { uid: result.uid, role: "student", schoolId: school.id, schoolName: school.name };
        }
        const created = await createManagedUser({
            role: "student", schoolId: null, name: input.name, phone: input.phone, email: input.email, password: input.password,
            profile: { class: input.classLevel, parentEmail: input.parentEmail ?? null, parentPhone: input.parentPhone ?? null },
        });
        return { uid: created.uid, role: "student", schoolId: null, schoolName: null };
    }
    const created = await createManagedUser({
        role: input.role, schoolId: null, name: input.name, phone: input.phone, email: input.email, password: input.password,
        profile: input.role === "teacher" ? { assignedClasses: [] } : { linkedStudents: [] },
    });
    return { uid: created.uid, role: input.role, schoolId: null, schoolName: null };
}

export async function importStudents(schoolId: string, rows: ImportedStudentRow[], actor: Actor, allowedSectionIds: Set<string> | null): Promise<ImportOutcome[]> {
    const sections = await listSections(schoolId, false);
    const byKey = new Map(sections.map((section) => [`${section.classLevel}-${section.name}`, section]));
    const outcomes: ImportOutcome[] = [];
    for (const row of rows) {
        const base = { line: row.line, name: row.name, phone: row.phone, classLevel: row.classLevel, sectionLabel: row.section ? sectionLabel(row.classLevel, row.section) : null };
        if (row.error) { outcomes.push({ ...base, password: null, status: "failed", error: row.error }); continue; }
        try {
            let section = row.section ? byKey.get(`${row.classLevel}-${row.section}`) ?? null : null;
            if (row.section && !section) {
                if (allowedSectionIds) throw new SchoolError(404, `Section ${base.sectionLabel} does not exist; ask the school admin to create it`);
                section = await createSection(schoolId, { classLevel: row.classLevel as 6 | 7 | 8, name: row.section }, actor);
                byKey.set(`${section.classLevel}-${section.name}`, section);
            }
            if (section && allowedSectionIds && !allowedSectionIds.has(section.id)) throw new SchoolError(403, `You are not assigned to ${section.label}`);
            const result = await enrollStudent({
                schoolId, source: "import", name: row.name, phone: row.phone, email: row.email, password: row.password,
                classLevel: row.classLevel as 6 | 7 | 8, sectionId: section?.id ?? null, parentPhone: row.parentPhone, parentEmail: null,
            }, actor);
            outcomes.push({ ...base, sectionLabel: section?.label ?? null, password: result.password ?? row.password, status: "created", error: null });
        } catch (error) {
            outcomes.push({ ...base, password: null, status: "failed", error: error instanceof Error ? error.message : "Could not create the account" });
        }
    }
    return outcomes;
}

async function authFlags(uids: string[]): Promise<Map<string, { disabled: boolean }>> {
    const flags = new Map<string, { disabled: boolean }>();
    for (let start = 0; start < uids.length; start += AUTH_LOOKUP_CHUNK) {
        const chunk = uids.slice(start, start + AUTH_LOOKUP_CHUNK);
        const result = await adminAuth.getUsers(chunk.map((uid) => ({ uid })));
        for (const user of result.users) flags.set(user.uid, { disabled: user.disabled });
    }
    return flags;
}

function studentRow(uid: string, data: DocumentData, disabled: boolean, access: StudentAccess): SchoolStudentRow {
    return {
        uid,
        name: String(data.name ?? "Student"),
        email: isPhoneEmail(data.email) ? "" : String(data.email ?? ""),
        phone: typeof data.phone === "string" ? data.phone : null,
        contact: displayContact(data),
        classLevel: Number(data.class) || 0,
        sectionId: typeof data.sectionId === "string" ? data.sectionId : null,
        sectionLabel: typeof data.sectionLabel === "string" ? data.sectionLabel : null,
        paid: data.membership?.paid === true,
        premium: access.premium,
        diagnosticCompleted: data.diagnosticCompleted === true || data.placementCompleted === true,
        xp: Number(data.xp ?? 0),
        quizzesCompleted: Number(data.quizzesCompleted ?? 0),
        lessonsCompleted: Number(data.lessonsCompleted ?? 0),
        lastActiveAt: toMillis(data.lastActiveAt),
        disabled,
        schoolStatus: data.schoolStatus === "graduated" ? "graduated" : "active",
        parentEmail: typeof data.parentEmail === "string" && data.parentEmail ? data.parentEmail : null,
        parentPhone: typeof data.parentPhone === "string" ? data.parentPhone : null,
        createdAt: toMillis(data.createdAt),
    };
}

export async function listSchoolStudents(schoolId: string, filter?: { sectionIds?: string[] | null; classes?: number[] | null }): Promise<SchoolStudentRow[]> {
    const [snapshot, school, settings] = await Promise.all([
        adminDb.collection("students").where("schoolId", "==", schoolId).get(),
        getSchool(schoolId),
        getAccessSettings(),
    ]);
    const docs = snapshot.docs.filter((doc) => {
        const data = doc.data();
        if (filter?.sectionIds && !(data.sectionId && filter.sectionIds.includes(String(data.sectionId)))) return false;
        if (filter?.classes && !filter.classes.includes(Number(data.class))) return false;
        return true;
    });
    const flags = await authFlags(docs.map((doc) => doc.id));
    const plan = schoolPlanInfo(school);
    return docs.map((doc) => {
        const data = doc.data();
        const access = resolveStudentAccess({ membershipPaid: data.membership?.paid, schoolId, school: plan, settings });
        return studentRow(doc.id, data, flags.get(doc.id)?.disabled === true, access);
    }).sort((left, right) => left.classLevel - right.classLevel || (left.sectionLabel ?? "").localeCompare(right.sectionLabel ?? "") || left.name.localeCompare(right.name));
}

export async function listSchoolTeachers(schoolId: string): Promise<SchoolTeacherRow[]> {
    const snapshot = await adminDb.collection("teachers").where("schoolId", "==", schoolId).get();
    const flags = await authFlags(snapshot.docs.map((doc) => doc.id));
    return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            uid: doc.id,
            name: String(data.name ?? "Teacher"),
            email: isPhoneEmail(data.email) ? "" : String(data.email ?? ""),
            phone: typeof data.phone === "string" ? data.phone : null,
            contact: displayContact(data),
            assignedSectionIds: Array.isArray(data.assignedSectionIds) ? data.assignedSectionIds.map(String) : [],
            assignedClasses: Array.isArray(data.assignedClasses) ? data.assignedClasses.map(Number) : [],
            disabled: flags.get(doc.id)?.disabled === true,
            createdAt: toMillis(data.createdAt),
        };
    }).sort((left, right) => left.name.localeCompare(right.name));
}

export async function listSchoolAdmins(schoolId: string): Promise<SchoolAdminRow[]> {
    const snapshot = await adminDb.collection("schoolAdmins").where("schoolId", "==", schoolId).get();
    const flags = await authFlags(snapshot.docs.map((doc) => doc.id));
    return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
            uid: doc.id,
            name: String(data.name ?? "Admin"),
            email: isPhoneEmail(data.email) ? "" : String(data.email ?? ""),
            phone: typeof data.phone === "string" ? data.phone : null,
            contact: displayContact(data),
            disabled: flags.get(doc.id)?.disabled === true,
        };
    });
}

/** The member's document, only when it belongs to this school; another school's member looks missing. */
export async function memberInSchool(collection: "students" | "teachers" | "schoolAdmins", schoolId: string, uid: string): Promise<{ ref: DocumentReference; data: DocumentData }> {
    if (!uid || uid.includes("/")) throw new SchoolError(404, "Not found in this school");
    const ref = adminDb.collection(collection).doc(uid);
    const snapshot = await ref.get();
    const data = snapshot.data();
    if (!data || data.schoolId !== schoolId) throw new SchoolError(404, "Not found in this school");
    return { ref, data };
}

export async function updateStudentInSchool(schoolId: string, uid: string, update: { name?: string; classLevel?: number; sectionId?: string | null; parentPhone?: string | null; parentEmail?: string | null }, actor: Actor): Promise<void> {
    const { ref, data } = await memberInSchool("students", schoolId, uid);
    const patch: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
    const classLevel = update.classLevel ?? Number(data.class);
    if (update.name !== undefined) patch.name = update.name;
    if (update.classLevel !== undefined) patch.class = update.classLevel;
    if (update.sectionId !== undefined) {
        const section = update.sectionId ? await sectionOrThrow(schoolId, update.sectionId, classLevel) : null;
        patch.sectionId = section?.id ?? null;
        patch.sectionLabel = section?.label ?? null;
    } else if (update.classLevel !== undefined && data.sectionId) {
        // A class change drops a section of the old class.
        const current = await adminDb.collection("schools").doc(schoolId).collection("sections").doc(String(data.sectionId)).get();
        if (Number(current.data()?.classLevel) !== classLevel) { patch.sectionId = null; patch.sectionLabel = null; }
    }
    if (update.parentPhone !== undefined) patch.parentPhone = update.parentPhone;
    if (update.parentEmail !== undefined) patch.parentEmail = update.parentEmail;
    if (update.name !== undefined) await adminAuth.updateUser(uid, { displayName: update.name }).catch(() => undefined);
    await ref.set(patch, { merge: true });
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.student.update", targetType: "student", targetId: uid, summary: JSON.stringify({ ...update }) });
}

export async function updateTeacherInSchool(schoolId: string, uid: string, update: { name?: string; sectionIds?: string[] }, actor: Actor): Promise<void> {
    const { ref } = await memberInSchool("teachers", schoolId, uid);
    const patch: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
    if (update.name !== undefined) { patch.name = update.name; await adminAuth.updateUser(uid, { displayName: update.name }).catch(() => undefined); }
    if (update.sectionIds !== undefined) {
        const sections = await listSections(schoolId, false);
        const chosen = sections.filter((section) => update.sectionIds!.includes(section.id));
        if (chosen.length !== new Set(update.sectionIds).size) throw new SchoolError(400, "One of the sections does not exist in this school");
        patch.assignedSectionIds = chosen.map((section) => section.id);
        // The class list keeps the existing class-based rules working for school teachers.
        patch.assignedClasses = [...new Set(chosen.map((section) => section.classLevel))].sort();
    }
    await ref.set(patch, { merge: true });
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.teacher.update", targetType: "teacher", targetId: uid, summary: JSON.stringify(update) });
}

export async function addTeacher(schoolId: string, input: ManagedTeacherInput, actor: Actor): Promise<{ uid: string; password: string | null }> {
    const sections = await listSections(schoolId, false);
    const chosen = sections.filter((section) => input.sectionIds.includes(section.id));
    if (chosen.length !== new Set(input.sectionIds).size) throw new SchoolError(400, "One of the sections does not exist in this school");
    const created = await createManagedUser({
        role: "teacher", schoolId, name: input.name, phone: input.phone, email: input.email, password: input.password,
        profile: { assignedSectionIds: chosen.map((section) => section.id), assignedClasses: [...new Set(chosen.map((section) => section.classLevel))].sort() },
    });
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.teacher.add", targetType: "teacher", targetId: created.uid, summary: `Added teacher ${input.name} to school ${schoolId} (${chosen.map((section) => section.label).join(", ") || "no sections"})` });
    return { uid: created.uid, password: created.password };
}

export async function addSchoolAdmin(schoolId: string, input: { name: string; phone: string; email: string | null; password: string }, actor: Actor): Promise<{ uid: string }> {
    const created = await createManagedUser({ role: "school_admin", schoolId, name: input.name, phone: input.phone, email: input.email, password: input.password });
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.admin.add", targetType: "schoolAdmin", targetId: created.uid, summary: `Added admin ${input.name} to school ${schoolId}` });
    return { uid: created.uid };
}

export type MemberAction = "suspend" | "unsuspend" | "resetPassword" | "remove";

/**
 * Suspend (cannot sign in), reset the password, or remove from the school. A removed student
 * keeps the account and all their work as an individual student; a removed teacher's account is
 * deactivated, so nobody keeps a teacher view of other people's children by accident.
 */
export async function memberAction(input: {
    collection: "students" | "teachers" | "schoolAdmins";
    schoolId: string;
    uid: string;
    action: MemberAction;
    password?: string | null;
    actor: Actor;
}): Promise<{ password: string | null }> {
    const { collection, schoolId, uid, action, actor } = input;
    const { ref, data } = await memberInSchool(collection, schoolId, uid);
    if (uid === actor.uid) throw new SchoolError(400, "You cannot change your own account here");
    let password: string | null = null;
    if (action === "suspend" || action === "unsuspend") {
        await adminAuth.updateUser(uid, { disabled: action === "suspend" });
        if (action === "suspend") await adminAuth.revokeRefreshTokens(uid);
    } else if (action === "resetPassword") {
        password = input.password ?? generatePassword();
        await adminAuth.updateUser(uid, { password });
        await adminAuth.revokeRefreshTokens(uid);
    } else if (action === "remove") {
        const record = await adminAuth.getUser(uid);
        const { schoolId: _dropped, ...claims } = record.customClaims ?? {};
        if (collection === "students") {
            await ref.set({ schoolId: null, sectionId: null, sectionLabel: null, schoolStatus: FieldValue.delete(), leftSchoolAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            await adminAuth.setCustomUserClaims(uid, claims);
            if (data.schoolStatus !== "graduated") await releaseSeat(schoolId);
        } else if (collection === "teachers") {
            await ref.set({ schoolId: null, assignedSectionIds: [], assignedClasses: [], leftSchoolAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            await adminAuth.setCustomUserClaims(uid, claims);
            await adminAuth.updateUser(uid, { disabled: true });
        } else {
            await ref.delete();
            await adminAuth.setCustomUserClaims(uid, claims);
            await adminAuth.updateUser(uid, { disabled: true });
        }
        await adminAuth.revokeRefreshTokens(uid);
    }
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: `school.member.${action}`, targetType: collection, targetId: uid, summary: `${action} ${String(data.name ?? uid)} (school ${schoolId})` });
    return { password };
}

/** The super admin's full delete: the account, the profile with every subcollection, and this week's board row. */
export async function deleteStudentAccount(uid: string, actor: Actor): Promise<void> {
    if (!uid || uid.includes("/")) throw new SchoolError(404, "Student not found");
    const ref = adminDb.collection("students").doc(uid);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new SchoolError(404, "Student not found");
    const data = snapshot.data() ?? {};
    const schoolId = typeof data.schoolId === "string" && data.schoolId ? data.schoolId : null;
    const weekKey = leaderboardWeekKey();
    const classLevel = Number(data.class);
    await adminDb.recursiveDelete(ref);
    if (isSchoolClass(classLevel)) {
        await adminDb.collection("leaderboards").doc(boardId(weekKey, classLevel, schoolId)).collection("entries").doc(uid).delete().catch(() => undefined);
    }
    await adminAuth.deleteUser(uid).catch((error: { code?: string }) => { if (error.code !== "auth/user-not-found") throw error; });
    if (schoolId && data.schoolStatus !== "graduated") await releaseSeat(schoolId).catch(() => undefined);
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "student.delete", targetType: "student", targetId: uid, summary: `Deleted student ${String(data.name ?? uid)}${schoolId ? ` of school ${schoolId}` : ""}` });
}

// ---------------------------------------------------------------------------------------------
// Sections

function toSection(id: string, data: DocumentData, students: number): SchoolSection {
    return {
        id,
        classLevel: Number(data.classLevel),
        name: String(data.name ?? ""),
        label: String(data.label ?? sectionLabel(Number(data.classLevel), String(data.name ?? ""))),
        active: data.active !== false,
        students,
    };
}

export async function listSections(schoolId: string, withCounts = true): Promise<SchoolSection[]> {
    const [snapshot, students] = await Promise.all([
        adminDb.collection("schools").doc(schoolId).collection("sections").get(),
        withCounts ? adminDb.collection("students").where("schoolId", "==", schoolId).select("sectionId", "schoolStatus").get() : null,
    ]);
    const counts = new Map<string, number>();
    for (const doc of students?.docs ?? []) {
        const data = doc.data();
        if (data.schoolStatus === "graduated" || typeof data.sectionId !== "string") continue;
        counts.set(data.sectionId, (counts.get(data.sectionId) ?? 0) + 1);
    }
    return snapshot.docs.map((doc) => toSection(doc.id, doc.data(), counts.get(doc.id) ?? 0))
        .sort((left, right) => left.classLevel - right.classLevel || left.name.localeCompare(right.name));
}

export async function createSection(schoolId: string, input: { classLevel: 6 | 7 | 8; name: string }, actor: Actor): Promise<SchoolSection> {
    const existing = await listSections(schoolId, false);
    const label = sectionLabel(input.classLevel, input.name);
    if (existing.some((section) => section.label === label)) throw new SchoolError(409, `Section ${label} already exists`);
    const id = shortId("sec");
    const data = { classLevel: input.classLevel, name: input.name, label, active: true, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    await adminDb.collection("schools").doc(schoolId).collection("sections").doc(id).set(data);
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.section.create", targetType: "section", targetId: id, summary: `Created ${label} in school ${schoolId}` });
    return toSection(id, data, 0);
}

export async function updateSection(schoolId: string, sectionId: string, update: { name?: string; active?: boolean }, actor: Actor): Promise<SchoolSection> {
    const ref = adminDb.collection("schools").doc(schoolId).collection("sections").doc(sectionId);
    const snapshot = await ref.get();
    const data = snapshot.data();
    if (!data) throw new SchoolError(404, "Section not found in this school");
    const patch: DocumentData = { updatedAt: FieldValue.serverTimestamp() };
    if (update.active !== undefined) patch.active = update.active;
    if (update.name !== undefined) {
        const label = sectionLabel(Number(data.classLevel), update.name);
        const clash = (await listSections(schoolId, false)).find((section) => section.label === label && section.id !== sectionId);
        if (clash) throw new SchoolError(409, `Section ${label} already exists`);
        patch.name = update.name;
        patch.label = label;
        // Students carry the label for display, so a rename reaches their records too.
        const students = await adminDb.collection("students").where("schoolId", "==", schoolId).where("sectionId", "==", sectionId).select().get();
        for (let start = 0; start < students.docs.length; start += BATCH_LIMIT) {
            const batch = adminDb.batch();
            for (const doc of students.docs.slice(start, start + BATCH_LIMIT)) batch.set(doc.ref, { sectionLabel: label, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            await batch.commit();
        }
    }
    await ref.set(patch, { merge: true });
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.section.update", targetType: "section", targetId: sectionId, summary: JSON.stringify(update) });
    const fresh = (await ref.get()).data() ?? {};
    return toSection(sectionId, fresh, 0);
}

export async function deleteSection(schoolId: string, sectionId: string, actor: Actor): Promise<void> {
    const ref = adminDb.collection("schools").doc(schoolId).collection("sections").doc(sectionId);
    const data = (await ref.get()).data();
    if (!data) throw new SchoolError(404, "Section not found in this school");
    const students = await adminDb.collection("students").where("schoolId", "==", schoolId).where("sectionId", "==", sectionId).count().get();
    if (students.data().count > 0) throw new SchoolError(409, `Move the ${students.data().count} students out of ${data.label} first`);
    await ref.delete();
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.section.delete", targetType: "section", targetId: sectionId, summary: `Deleted ${data.label} in school ${schoolId}` });
}

// ---------------------------------------------------------------------------------------------
// Annual promotion

export interface PromotionResult {
    moved: number;
    graduated: number;
    createdSections: string[];
    summary: Array<{ from: string; to: string; students: number }>;
    skipped: number;
}

export async function previewPromotion(schoolId: string) {
    const [sections, students] = await Promise.all([
        listSections(schoolId, false),
        adminDb.collection("students").where("schoolId", "==", schoolId).select("class", "sectionId", "schoolStatus").get(),
    ]);
    return planPromotion(sections, students.docs.map((doc) => ({ uid: doc.id, classLevel: Number(doc.data().class), sectionId: typeof doc.data().sectionId === "string" ? doc.data().sectionId : null, schoolStatus: doc.data().schoolStatus ?? null })));
}

/** Moves every class up one year in one go; Class 8 graduates and keeps every record. */
export async function promoteSchool(schoolId: string, options: { askDiagnosticAgain: boolean; force: boolean }, actor: Actor): Promise<PromotionResult> {
    const school = await requireSchool(schoolId, true);
    if (!options.force && school.lastPromotedAt && Date.now() - school.lastPromotedAt < PROMOTION_COOLDOWN_MS) {
        throw new SchoolError(409, `This school was promoted on ${new Date(school.lastPromotedAt).toISOString().slice(0, 10)}; tick "I understand" to run it again`, "RECENT_PROMOTION");
    }
    const plan = await previewPromotion(schoolId);
    const sections = await listSections(schoolId, false);
    const sectionIdByKey = new Map(sections.map((section) => [`${section.classLevel}-${section.name}`, section]));
    const createdSections: string[] = [];
    for (const missing of plan.sectionsToCreate) {
        const section = await createSection(schoolId, { classLevel: missing.classLevel as 6 | 7 | 8, name: missing.name }, actor);
        sectionIdByKey.set(`${section.classLevel}-${section.name}`, section);
        createdSections.push(section.label);
    }
    const year = new Date().getFullYear();
    const writes: Array<{ ref: DocumentReference; data: DocumentData }> = [];
    for (const move of plan.moves) {
        const section = move.toSectionName ? sectionIdByKey.get(`${move.toClass}-${move.toSectionName}`) ?? null : null;
        writes.push({
            ref: adminDb.collection("students").doc(move.uid),
            data: {
                class: move.toClass,
                sectionId: section?.id ?? null,
                sectionLabel: section?.label ?? null,
                promotedAt: FieldValue.serverTimestamp(),
                promotedFromClass: move.fromClass,
                ...(options.askDiagnosticAgain ? { diagnosticCompleted: false, placementCompleted: false } : {}),
                updatedAt: FieldValue.serverTimestamp(),
            },
        });
    }
    for (const uid of plan.graduates) {
        writes.push({
            ref: adminDb.collection("students").doc(uid),
            data: { schoolStatus: "graduated", sectionId: null, sectionLabel: `Graduated ${year}`, graduatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
        });
    }
    for (let start = 0; start < writes.length; start += BATCH_LIMIT) {
        const batch = adminDb.batch();
        for (const write of writes.slice(start, start + BATCH_LIMIT)) batch.set(write.ref, write.data, { merge: true });
        await batch.commit();
    }
    const record = { moved: plan.moves.length, graduated: plan.graduates.length, createdSections, summary: plan.summary, skipped: plan.skipped };
    await adminDb.collection("schools").doc(schoolId).collection("promotions").doc(shortId("prom")).set({ ...record, askDiagnosticAgain: options.askDiagnosticAgain, by: actor.uid, at: FieldValue.serverTimestamp() });
    await adminDb.collection("schools").doc(schoolId).set({ lastPromotedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    await recountSeats(schoolId);
    await writeAuditLog({ actorUid: actor.uid, actorEmail: actor.email, action: "school.promote", targetType: "school", targetId: schoolId, summary: `Promoted ${record.moved} students, graduated ${record.graduated}` });
    return record;
}

// ---------------------------------------------------------------------------------------------
// Overview and report

export interface SchoolOverview {
    school: School;
    students: { total: number; active: number; graduated: number; premium: number; free: number; paid: number; diagnosticCompleted: number; activeToday: number; active7d: number };
    teachers: number;
    sections: SchoolSection[];
    admins: number;
}

export async function schoolOverview(schoolId: string): Promise<SchoolOverview> {
    const [school, students, sections, teachers, admins] = await Promise.all([
        requireSchool(schoolId, true),
        listSchoolStudents(schoolId),
        listSections(schoolId),
        adminDb.collection("teachers").where("schoolId", "==", schoolId).count().get(),
        adminDb.collection("schoolAdmins").where("schoolId", "==", schoolId).count().get(),
    ]);
    const now = Date.now();
    const dayStart = now - 86_400_000;
    const weekStart = now - 7 * 86_400_000;
    const active = students.filter((student) => student.schoolStatus === "active");
    return {
        school,
        students: {
            total: students.length,
            active: active.length,
            graduated: students.length - active.length,
            premium: active.filter((student) => student.premium).length,
            free: active.filter((student) => !student.premium).length,
            paid: active.filter((student) => student.paid).length,
            diagnosticCompleted: active.filter((student) => student.diagnosticCompleted).length,
            activeToday: active.filter((student) => (student.lastActiveAt ?? 0) >= dayStart).length,
            active7d: active.filter((student) => (student.lastActiveAt ?? 0) >= weekStart).length,
        },
        teachers: teachers.data().count,
        sections,
        admins: admins.data().count,
    };
}

export interface SectionReport {
    sectionId: string | null;
    label: string;
    classLevel: number;
    students: number;
    diagnosticCompleted: number;
    quizzesCompleted: number;
    lessonsCompleted: number;
    averageXp: number;
    active7d: number;
    premium: number;
    paid: number;
}

/** Performance by section, from the counters every student document already carries. */
export async function schoolReport(schoolId: string): Promise<{ sections: SectionReport[]; students: SchoolStudentRow[] }> {
    const students = (await listSchoolStudents(schoolId)).filter((student) => student.schoolStatus === "active");
    const weekStart = Date.now() - 7 * 86_400_000;
    const groups = new Map<string, SchoolStudentRow[]>();
    for (const student of students) {
        const key = student.sectionId ?? `class-${student.classLevel}`;
        groups.set(key, [...(groups.get(key) ?? []), student]);
    }
    const sections = [...groups.entries()].map(([key, rows]) => ({
        sectionId: key.startsWith("class-") ? null : key,
        label: rows[0].sectionLabel ?? `Class ${rows[0].classLevel} (no section)`,
        classLevel: rows[0].classLevel,
        students: rows.length,
        diagnosticCompleted: rows.filter((row) => row.diagnosticCompleted).length,
        quizzesCompleted: rows.reduce((sum, row) => sum + row.quizzesCompleted, 0),
        lessonsCompleted: rows.reduce((sum, row) => sum + row.lessonsCompleted, 0),
        averageXp: Math.round(rows.reduce((sum, row) => sum + row.xp, 0) / rows.length),
        active7d: rows.filter((row) => (row.lastActiveAt ?? 0) >= weekStart).length,
        premium: rows.filter((row) => row.premium).length,
        paid: rows.filter((row) => row.paid).length,
    })).sort((left, right) => left.classLevel - right.classLevel || left.label.localeCompare(right.label));
    return { sections, students };
}

export function schoolErrorResponse(error: unknown): { status: number; body: Record<string, unknown> } | null {
    if (error instanceof SchoolError) return { status: error.status, body: { success: false, error: error.message, ...(error.code ? { code: error.code } : {}) } };
    return null;
}

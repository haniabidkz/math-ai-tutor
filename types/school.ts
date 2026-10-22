import type { PlanState, SchoolStatus } from "@/lib/access";

/** A school as the admin screens see it; timestamps are epoch milliseconds. */
export interface School {
    id: string;
    name: string;
    code: string;
    city: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    /** The stored plan; `effectivePlan` applies the trial and paid-until dates. */
    plan: PlanState;
    effectivePlan: PlanState;
    trialEndsAt: number | null;
    trialDaysLeft: number;
    paidUntil: number | null;
    trialFullAccess: boolean;
    seatLimit: number;
    seatsUsed: number;
    status: SchoolStatus;
    notes: string;
    createdAt: number | null;
    lastPromotedAt: number | null;
}

export interface SchoolSection {
    id: string;
    classLevel: number;
    name: string;
    /** "6-A" */
    label: string;
    active: boolean;
    students: number;
}

/** A student row in the school admin and teacher panels. */
export interface SchoolStudentRow {
    uid: string;
    name: string;
    email: string;
    phone: string | null;
    contact: string;
    classLevel: number;
    sectionId: string | null;
    sectionLabel: string | null;
    paid: boolean;
    /** Full curriculum (individually paid, paid school plan or a demo trial). */
    premium: boolean;
    diagnosticCompleted: boolean;
    xp: number;
    quizzesCompleted: number;
    lessonsCompleted: number;
    lastActiveAt: number | null;
    disabled: boolean;
    schoolStatus: "active" | "graduated";
    parentEmail: string | null;
    parentPhone: string | null;
    createdAt: number | null;
}

export interface SchoolTeacherRow {
    uid: string;
    name: string;
    email: string;
    phone: string | null;
    contact: string;
    assignedSectionIds: string[];
    assignedClasses: number[];
    disabled: boolean;
    createdAt: number | null;
}

export interface SchoolAdminRow {
    uid: string;
    name: string;
    email: string;
    phone: string | null;
    contact: string;
    disabled: boolean;
}

/** One line of a bulk import after the server processed it. */
export interface ImportOutcome {
    line: number;
    name: string;
    phone: string;
    classLevel: number;
    sectionLabel: string | null;
    password: string | null;
    status: "created" | "failed";
    error: string | null;
}

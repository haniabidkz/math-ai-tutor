// Types for student users and profiles

export type ClassLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type UserRole = "student" | "parent" | "teacher" | "school_admin" | "super_admin";

export type UnderstandingLevel = "WEAK" | "AVERAGE" | "GOOD" | "EXCELLENT";

export interface StudentProfile {
    uid: string;
    name: string;
    email: string;
    /** E.164, when the student signed up or was enrolled with a phone number. */
    phone?: string | null;
    class: ClassLevel;
    adaptive_level?: 1 | 2 | 3 | 4 | 5;
    placementCompleted?: boolean;
    parentEmail?: string;
    parentPhone?: string | null;
    /** Null for an individual (B2C) student; set when the student belongs to a school. */
    schoolId?: string | null;
    sectionId?: string | null;
    sectionLabel?: string | null;
    schoolStatus?: "active" | "graduated";
    role: UserRole;
    createdAt: Date;
    updatedAt: Date;
}

export interface TopicProgress {
    topicId: string;
    topicName: string;
    classLevel: ClassLevel;
    teachingLevel: 1 | 2 | 3;
    teachingAttempts: number;
    needsHumanAttention: boolean;
    understood: boolean;
    understandingLevel?: UnderstandingLevel;
    completedAt?: Date;
    updatedAt: Date;
}

export interface ParentProfile {
    uid: string;
    name: string;
    email: string;
    phone?: string | null;
    role: "parent";
    linkedStudents: string[]; // Student UIDs
    createdAt: Date;
}

export interface TeacherProfile {
    uid: string;
    name: string;
    email: string;
    phone?: string | null;
    role: "teacher";
    assignedClasses: ClassLevel[];
    schoolId?: string | null;
    /** Sections a school teacher is responsible for. */
    assignedSectionIds?: string[];
    createdAt: Date;
}

export interface SchoolAdminProfile {
    uid: string;
    name: string;
    email: string;
    phone?: string | null;
    role: "school_admin";
    schoolId: string;
    createdAt: Date;
}

// Types for student users and profiles

export type ClassLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type UserRole = "student" | "parent" | "teacher" | "super_admin";

export type UnderstandingLevel = "WEAK" | "AVERAGE" | "GOOD" | "EXCELLENT";

export interface StudentProfile {
    uid: string;
    name: string;
    email: string;
    class: ClassLevel;
    adaptive_level?: 1 | 2 | 3 | 4 | 5;
    placementCompleted?: boolean;
    parentEmail?: string;
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
    role: "parent";
    linkedStudents: string[]; // Student UIDs
    createdAt: Date;
}

export interface TeacherProfile {
    uid: string;
    name: string;
    email: string;
    role: "teacher";
    assignedClasses: ClassLevel[];
    createdAt: Date;
}

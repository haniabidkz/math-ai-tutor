import type { LocalizedText, StudentClassLevel } from "./curriculum";

export type HomeworkStatus = "not_started" | "in_progress" | "completed";

export interface HomeworkAssignment {
    id: string;
    microTag: string;
    title: LocalizedText;
    topicTitle: LocalizedText;
    classLevel: StudentClassLevel;
    questionCount: number;
    /** ISO date (YYYY-MM-DD) the homework is due. */
    dueDate: string;
    /** When true the whole class is assigned and studentUids is ignored. */
    allStudents: boolean;
    studentUids: string[];
    assignedByUid: string;
    assignedByEmail: string;
    note?: string;
    /** Set when several modules were assigned together as one packet. */
    packetId?: string | null;
    packetTitle?: string | null;
    /** Null for homework set to individual students; a school's homework stays inside the school. */
    schoolId?: string | null;
    sectionId?: string | null;
    sectionLabel?: string | null;
}

export interface StudentHomework extends HomeworkAssignment {
    status: HomeworkStatus;
    percentage: number | null;
    completedAt: string | null;
    overdue: boolean;
    /** The lesson sits outside the student's free chapters; it opens with a paid plan. */
    locked?: boolean;
}

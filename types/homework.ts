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
}

export interface StudentHomework extends HomeworkAssignment {
    status: HomeworkStatus;
    percentage: number | null;
    completedAt: string | null;
    overdue: boolean;
}

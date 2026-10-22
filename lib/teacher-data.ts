"use client";

import type { User } from "firebase/auth";
import type { SchoolSection } from "@/types/school";

export interface TeacherSchool {
    id: string;
    name: string;
    code: string;
    plan: "trial" | "paid" | "expired";
    trialDaysLeft: number;
    seatsUsed: number;
    seatLimit: number;
}

export interface TeacherData<T> {
    students: T[];
    classes: number[];
    /** Null for an individual teacher. */
    school: TeacherSchool | null;
    /** The teacher's sections (all of the school's when none are assigned). */
    sections: SchoolSection[];
}

/** Loads the teacher's students, school and sections from the server, with a clear message when it fails. */
export async function fetchTeacherData<T>(user: User): Promise<TeacherData<T>> {
    const token = await user.getIdToken();
    let response: Response;
    try {
        response = await fetch("/api/teacher/students", { headers: { Authorization: `Bearer ${token}` } });
    } catch {
        throw new Error("No connection. Check your internet and try again.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `The student list could not be loaded (HTTP ${response.status}).`);
    return {
        students: Array.isArray(data.students) ? data.students : [],
        classes: Array.isArray(data.classes) ? data.classes : [],
        school: data.school ?? null,
        sections: Array.isArray(data.sections) ? data.sections : [],
    };
}

export async function fetchTeacherStudents<T>(user: User): Promise<T[]> {
    return (await fetchTeacherData<T>(user)).students;
}

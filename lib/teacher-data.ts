"use client";

import type { User } from "firebase/auth";

/** Loads the teacher's students from the server, with a clear message when it fails. */
export async function fetchTeacherStudents<T>(user: User): Promise<T[]> {
    const token = await user.getIdToken();
    let response: Response;
    try {
        response = await fetch("/api/teacher/students", { headers: { Authorization: `Bearer ${token}` } });
    } catch {
        throw new Error("No connection. Check your internet and try again.");
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `The student list could not be loaded (HTTP ${response.status}).`);
    return Array.isArray(data.students) ? data.students : [];
}

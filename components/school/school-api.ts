"use client";

import { adminApi, ApiError, jsonInit } from "@/lib/admin-api";
import { formatPhone, normalizePhone } from "@/lib/phone";

export { ApiError, jsonInit };

/**
 * Calls the school APIs as the signed-in school admin or teacher. The super admin can look at
 * any school by passing its id, which travels as a header the server checks.
 */
export async function schoolApi<T = any>(path: string, init?: RequestInit, schoolId?: string | null): Promise<T> {
    return adminApi<T>(path, { ...init, headers: { ...(init?.headers ?? {}), ...(schoolId ? { "x-school-id": schoolId } : {}) } });
}

export const formatDate = (millis: number | null | undefined) =>
    millis ? new Intl.DateTimeFormat("en-PK", { dateStyle: "medium" }).format(millis) : "—";

export const formatDateTime = (millis: number | null | undefined) =>
    millis ? new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(millis) : "—";

/** Saves rows as a CSV file the browser downloads; Excel opens it directly. */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>) {
    const escape = (value: string | number | null | undefined) => {
        const text = value === null || value === undefined ? "" : String(value);
        return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
    };
    const lines = [header, ...rows].map((row) => row.map(escape).join(","));
    const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
}

/** A phone as typed by the admin, shown the way the system stores it (0300 1234567). */
export function prettyPhone(raw: string | null | undefined): string {
    const value = String(raw ?? "");
    return formatPhone(normalizePhone(value) ?? value) || value;
}

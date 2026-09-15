import { auth } from "@/lib/firebase";

/** A failed admin request, keeping the response body so callers can read codes and details. */
export class ApiError extends Error {
    constructor(message: string, public status: number, public body: Record<string, unknown>) {
        super(message);
        this.name = "ApiError";
    }
}

/**
 * Every call asks Firebase for the current ID token. Tokens expire after an hour, and the
 * admin page used to hold the first one forever, so every save failed once it went stale.
 */
export async function adminApi<T = any>(path: string, init?: RequestInit): Promise<T> {
    const current = auth.currentUser;
    if (!current) throw new ApiError("You are signed out. Please sign in again.", 401, {});
    const token = await current.getIdToken();
    const response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = typeof data.error === "string" ? data.error : response.status === 401 ? "Your session expired. Please sign in again." : "Request failed";
        throw new ApiError(message, response.status, data);
    }
    return data as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

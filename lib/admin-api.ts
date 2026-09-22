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
 *
 * A dropped connection or a gateway timeout (Vercel answers those with plain text, not JSON)
 * becomes an ApiError with a transient code, so long-running screens can wait and retry
 * instead of stopping on "Request failed".
 */
export async function adminApi<T = any>(path: string, init?: RequestInit): Promise<T> {
    const current = auth.currentUser;
    if (!current) throw new ApiError("You are signed out. Please sign in again.", 401, {});
    const token = await current.getIdToken();
    let response: Response;
    try {
        response = await fetch(path, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) } });
    } catch {
        throw new ApiError("The connection dropped. Check your internet; the request will be tried again.", 0, { code: "network" });
    }
    const text = await response.text().catch(() => "");
    let data: Record<string, unknown> = {};
    try {
        data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
        data = {};
    }
    if (!response.ok) {
        if (typeof data.error === "string") {
            const detail = typeof data.detail === "string" && data.detail ? ` (${data.detail})` : "";
            throw new ApiError(`${data.error}${detail}`, response.status, data);
        }
        if (response.status === 401) throw new ApiError("Your session expired. Please sign in again.", 401, data);
        if ([502, 503, 504].includes(response.status)) {
            const reason = text.includes("FUNCTION_INVOCATION_TIMEOUT") ? "took too long" : "did not answer";
            throw new ApiError(`The server ${reason} (HTTP ${response.status}); the request will be tried again.`, response.status, { code: "gateway" });
        }
        throw new ApiError(`Request failed (HTTP ${response.status})`, response.status, data);
    }
    return data as T;
}

export const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
});

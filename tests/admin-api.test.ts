import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi, ApiError } from "@/lib/admin-api";

vi.mock("@/lib/firebase", () => ({ auth: { currentUser: { getIdToken: async () => "test-token" } } }));

const respond = (status: number, body: string, contentType = "application/json") =>
    vi.fn(async () => new Response(body, { status, headers: { "Content-Type": contentType } }));

beforeEach(() => vi.stubGlobal("fetch", respond(200, "{}")));
afterEach(() => vi.unstubAllGlobals());

async function failure(promise: Promise<unknown>): Promise<ApiError> {
    try {
        await promise;
    } catch (caught) {
        return caught as ApiError;
    }
    throw new Error("expected the request to fail");
}

describe("admin requests", () => {
    it("sends the current sign-in token and returns the JSON body", async () => {
        vi.stubGlobal("fetch", respond(200, JSON.stringify({ success: true, drafts: [] })));
        await expect(adminApi("/api/admin/ai-studio/drafts")).resolves.toEqual({ success: true, drafts: [] });
        const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
        expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer test-token" });
    });

    it("turns a dropped connection into a retryable error", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
        const error = await failure(adminApi("/api/x"));
        expect(error.body.code).toBe("network");
        expect(error.message).toContain("connection dropped");
    });

    it("turns a plain-text gateway timeout into a retryable error with the status", async () => {
        vi.stubGlobal("fetch", respond(504, "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT\n", "text/plain"));
        const error = await failure(adminApi("/api/x"));
        expect(error).toMatchObject({ status: 504, body: { code: "gateway" } });
        expect(error.message).toBe("The server took too long (HTTP 504); the request will be tried again.");
    });

    it("shows the server's message and its detail, keeping the body for codes", async () => {
        vi.stubGlobal("fetch", respond(500, JSON.stringify({ success: false, error: "The draft could not be pushed live", detail: "10 DEADLINE_EXCEEDED" })));
        const error = await failure(adminApi("/api/x"));
        expect(error.message).toBe("The draft could not be pushed live (10 DEADLINE_EXCEEDED)");
        vi.stubGlobal("fetch", respond(502, JSON.stringify({ success: false, error: "OpenAI is busy", code: "busy" })));
        expect((await failure(adminApi("/api/x"))).body.code).toBe("busy");
    });

    it("names the status when a failure has no message at all", async () => {
        vi.stubGlobal("fetch", respond(500, "<html>oops</html>", "text/html"));
        expect((await failure(adminApi("/api/x"))).message).toBe("Request failed (HTTP 500)");
        vi.stubGlobal("fetch", respond(401, ""));
        expect((await failure(adminApi("/api/x"))).message).toBe("Your session expired. Please sign in again.");
    });
});

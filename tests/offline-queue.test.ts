import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    clearSessionQueue,
    enqueueAnswer,
    loadQueue,
    pendingForSession,
    queueSize,
    removeAnswer,
    syncQueue,
    type QueueStorage,
    type QueuedAnswer,
} from "@/lib/offline-queue";

function memoryStorage(): QueueStorage {
    const map = new Map<string, string>();
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => { map.set(key, value); },
        removeItem: (key) => { map.delete(key); },
    };
}

function answer(overrides: Partial<QueuedAnswer> & { eventId: string }): QueuedAnswer {
    return {
        sessionId: "s-1",
        questionId: "q-1",
        optionId: "A",
        position: 0,
        queuedAt: 0,
        ...overrides,
    };
}

let storage: QueueStorage;
beforeEach(() => { storage = memoryStorage(); });

describe("offline answer queue", () => {
    it("starts empty and survives round trips", () => {
        expect(loadQueue(storage)).toEqual([]);
        enqueueAnswer(answer({ eventId: "e1" }), storage);
        expect(queueSize(storage)).toBe(1);
        expect(loadQueue(storage)[0].eventId).toBe("e1");
    });

    it("never queues the same event twice", () => {
        enqueueAnswer(answer({ eventId: "e1" }), storage);
        enqueueAnswer(answer({ eventId: "e1" }), storage);
        expect(queueSize(storage)).toBe(1);
    });

    it("returns one session's answers in the order they were given", () => {
        enqueueAnswer(answer({ eventId: "e3", position: 2 }), storage);
        enqueueAnswer(answer({ eventId: "e1", position: 0 }), storage);
        enqueueAnswer(answer({ eventId: "e2", position: 1 }), storage);
        enqueueAnswer(answer({ eventId: "other", sessionId: "s-2", position: 0 }), storage);
        expect(pendingForSession("s-1", storage).map((item) => item.eventId)).toEqual(["e1", "e2", "e3"]);
    });

    it("removes individual answers and whole sessions", () => {
        enqueueAnswer(answer({ eventId: "e1" }), storage);
        enqueueAnswer(answer({ eventId: "e2", sessionId: "s-2" }), storage);
        removeAnswer("e1", storage);
        expect(queueSize(storage)).toBe(1);
        clearSessionQueue("s-2", storage);
        expect(queueSize(storage)).toBe(0);
    });

    it("tolerates corrupt stored data", () => {
        storage.setItem("mathTutorOfflineAnswers", "{not json");
        expect(loadQueue(storage)).toEqual([]);
    });
});

describe("queue sync", () => {
    beforeEach(() => {
        enqueueAnswer(answer({ eventId: "e1", position: 0 }), storage);
        enqueueAnswer(answer({ eventId: "e2", position: 1 }), storage);
    });

    it("drains the queue when every answer is accepted", async () => {
        const send = vi.fn().mockResolvedValue({ ok: true, retryable: false });
        const result = await syncQueue("s-1", send, storage);
        expect(result).toEqual({ synced: 2, outcome: "synced" });
        expect(queueSize(storage)).toBe(0);
        expect(send).toHaveBeenCalledTimes(2);
    });

    it("replays in order and keeps unsent answers when the network drops mid-sync", async () => {
        const send = vi.fn()
            .mockResolvedValueOnce({ ok: true, retryable: false })
            .mockRejectedValueOnce(new Error("offline"));
        const result = await syncQueue("s-1", send, storage);
        expect(result).toEqual({ synced: 1, outcome: "offline" });
        expect(pendingForSession("s-1", storage).map((item) => item.eventId)).toEqual(["e2"]);
    });

    it("holds the queue when the server is temporarily unavailable", async () => {
        const send = vi.fn().mockResolvedValue({ ok: false, retryable: true });
        const result = await syncQueue("s-1", send, storage);
        expect(result).toEqual({ synced: 0, outcome: "offline" });
        expect(queueSize(storage)).toBe(2);
    });

    it("drops a permanently rejected answer instead of blocking forever", async () => {
        const send = vi.fn().mockResolvedValue({ ok: false, retryable: false });
        const result = await syncQueue("s-1", send, storage);
        expect(result.outcome).toBe("conflict");
        expect(pendingForSession("s-1", storage).map((item) => item.eventId)).toEqual(["e2"]);
    });

    it("is safe to run twice without double-sending", async () => {
        const send = vi.fn().mockResolvedValue({ ok: true, retryable: false });
        await syncQueue("s-1", send, storage);
        const second = await syncQueue("s-1", send, storage);
        expect(second).toEqual({ synced: 0, outcome: "synced" });
        expect(send).toHaveBeenCalledTimes(2);
    });
});

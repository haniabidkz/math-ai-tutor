/**
 * Local-first answer queue.
 *
 * When the network is unavailable the student keeps answering from the questions already
 * held on the device. Each answer is stored with a stable eventId, which is also what the
 * server uses to de-duplicate, so replaying the queue can never create a second record.
 */

export interface QueuedAnswer {
    eventId: string;
    sessionId: string;
    questionId: string;
    optionId: string;
    /** Local answer index, so a replay preserves the order the student answered in. */
    position: number;
    queuedAt: number;
}

export const OFFLINE_QUEUE_KEY = "mathTutorOfflineAnswers";

export interface QueueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
}

function safeStorage(storage?: QueueStorage): QueueStorage | null {
    if (storage) return storage;
    try {
        if (typeof window === "undefined" || !window.localStorage) return null;
        return window.localStorage;
    } catch {
        return null;
    }
}

export function loadQueue(storage?: QueueStorage): QueuedAnswer[] {
    const store = safeStorage(storage);
    if (!store) return [];
    try {
        const raw = store.getItem(OFFLINE_QUEUE_KEY);
        if (!raw) return [];
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return (parsed as QueuedAnswer[]).filter((item) =>
            item && typeof item.eventId === "string" && typeof item.sessionId === "string");
    } catch {
        return [];
    }
}

function persist(queue: QueuedAnswer[], storage?: QueueStorage): void {
    const store = safeStorage(storage);
    if (!store) return;
    try {
        if (queue.length === 0) store.removeItem(OFFLINE_QUEUE_KEY);
        else store.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    } catch {
        // A full or unavailable store must never break the quiz.
    }
}

/** Adds an answer unless the same eventId is already queued. */
export function enqueueAnswer(answer: QueuedAnswer, storage?: QueueStorage): QueuedAnswer[] {
    const queue = loadQueue(storage);
    if (queue.some((item) => item.eventId === answer.eventId)) return queue;
    const next = [...queue, answer];
    persist(next, storage);
    return next;
}

export function removeAnswer(eventId: string, storage?: QueueStorage): QueuedAnswer[] {
    const next = loadQueue(storage).filter((item) => item.eventId !== eventId);
    persist(next, storage);
    return next;
}

export function clearSessionQueue(sessionId: string, storage?: QueueStorage): QueuedAnswer[] {
    const next = loadQueue(storage).filter((item) => item.sessionId !== sessionId);
    persist(next, storage);
    return next;
}

/** Answers for one session, in the order the student produced them. */
export function pendingForSession(sessionId: string, storage?: QueueStorage): QueuedAnswer[] {
    return loadQueue(storage)
        .filter((item) => item.sessionId === sessionId)
        .sort((left, right) => left.position - right.position || left.queuedAt - right.queuedAt);
}

export function queueSize(storage?: QueueStorage): number {
    return loadQueue(storage).length;
}

export type SyncOutcome = "synced" | "conflict" | "offline";

/**
 * Replays queued answers oldest-first. A synced answer is removed immediately, so an
 * interrupted sync resumes exactly where it stopped without repeating anything.
 */
export async function syncQueue(
    sessionId: string,
    send: (answer: QueuedAnswer) => Promise<{ ok: boolean; retryable: boolean }>,
    storage?: QueueStorage,
): Promise<{ synced: number; outcome: SyncOutcome }> {
    let synced = 0;
    for (const answer of pendingForSession(sessionId, storage)) {
        let result: { ok: boolean; retryable: boolean };
        try {
            result = await send(answer);
        } catch {
            return { synced, outcome: "offline" };
        }
        if (result.ok) {
            removeAnswer(answer.eventId, storage);
            synced += 1;
            continue;
        }
        if (result.retryable) return { synced, outcome: "offline" };
        // The server rejected it outright, so keeping it queued would block forever.
        removeAnswer(answer.eventId, storage);
        return { synced, outcome: "conflict" };
    }
    return { synced, outcome: "synced" };
}

import { NextResponse } from "next/server";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { builtInQuestionsEnabled, QUESTION_BANK } from "@/lib/question-bank";
import { AiError } from "@/lib/ai-studio/ai";
import { NEW_MICRO_TAG, type GenerationDraft } from "@/lib/ai-studio/types";
import { authErrorResponse } from "@/lib/server-auth";
import type { MicroConcept } from "@/types/curriculum";

/** Server-only storage helpers for AI Studio drafts (collection generationDrafts). */

export const draftsCollection = () => adminDb.collection("generationDrafts");

export class StudioError extends Error {
    constructor(public status: number, message: string, public details?: unknown) {
        super(message);
        this.name = "StudioError";
    }
}

export function draftFrom(snapshot: DocumentSnapshot): GenerationDraft {
    if (!snapshot.exists) throw new StudioError(404, "This draft no longer exists.");
    return { ...(snapshot.data() as GenerationDraft), id: snapshot.id };
}

export async function loadDraft(id: string): Promise<GenerationDraft> {
    return draftFrom(await draftsCollection().doc(id).get());
}

/** Firestore rejects undefined values, so arrays of optional fields are written through this. */
export function clean<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

const millis = (value: unknown) => (value && typeof (value as { toMillis?: () => number }).toMillis === "function"
    ? (value as { toMillis: () => number }).toMillis()
    : null);

/** Timestamps become plain milliseconds for the browser. */
export function toClientDraft(draft: GenerationDraft) {
    return { ...draft, createdAt: millis(draft.createdAt), updatedAt: millis(draft.updatedAt), approvedAt: millis(draft.approvedAt) };
}

export function assertOpen(draft: GenerationDraft) {
    if (draft.status === "approved") throw new StudioError(409, "This draft is already live and can no longer change.");
    if (draft.status === "discarded") throw new StudioError(409, "This draft was discarded.");
}

/** Every concept, stored or bundled, so a new micro-topic tag never collides with either. */
export async function allConcepts(): Promise<MicroConcept[]> {
    const snapshot = await adminDb.collection("microConcepts").get();
    const stored = snapshot.docs.map((doc) => ({ ...doc.data(), microTag: doc.id }) as MicroConcept);
    const storedTags = new Set(stored.map((concept) => concept.microTag));
    return [...stored, ...MICRO_CONCEPTS.filter((concept) => !storedTags.has(concept.microTag))];
}

interface StoredPoolQuestion {
    id: string;
    microTag: string;
    text: string;
    status: string;
    diagnostic: boolean;
}

async function storedQuestions(microTags: string[]): Promise<StoredPoolQuestion[]> {
    const tags = [...new Set(microTags.filter((tag) => tag !== NEW_MICRO_TAG))];
    const found: StoredPoolQuestion[] = [];
    for (let start = 0; start < tags.length; start += 30) {
        const snapshot = await adminDb.collection("questions").where("microTag", "in", tags.slice(start, start + 30)).get();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            found.push({
                id: doc.id,
                microTag: String(data.microTag),
                text: String(data.question?.english ?? ""),
                status: String(data.status ?? ""),
                diagnostic: data.purpose === "diagnostic",
            });
        }
    }
    return found;
}

/** Question texts already live for these micro-topics, used to stop repeats. */
export async function liveQuestionTexts(microTags: string[]): Promise<string[]> {
    const stored = await storedQuestions(microTags);
    const texts = stored.filter((question) => question.status !== "archived" && question.text).map((question) => question.text);
    // Outside production, micro-topics never seeded to Firestore still serve the bundled bank.
    if (builtInQuestionsEnabled()) {
        const seeded = new Set(stored.map((question) => question.microTag));
        for (const tag of new Set(microTags)) {
            if (!seeded.has(tag)) texts.push(...QUESTION_BANK.filter((question) => question.microTag === tag).map((question) => question.question.english));
        }
    }
    return texts;
}

/**
 * The practice questions these micro-topics already have, which "replace older questions" on
 * approval removes. Diagnostic test questions are never included.
 */
export async function replaceablePoolQuestions(microTags: string[]): Promise<Array<{ id: string; microTag: string }>> {
    return (await storedQuestions(microTags))
        .filter((question) => !question.diagnostic)
        .map(({ id, microTag }) => ({ id, microTag }));
}

export function studioErrorResponse(error: unknown, fallback: string) {
    const auth = authErrorResponse(error);
    if (auth) return NextResponse.json(auth.body, { status: auth.status });
    if (error instanceof StudioError) {
        return NextResponse.json({ success: false, error: error.message, ...(error.details ? { details: error.details } : {}) }, { status: error.status });
    }
    if (error instanceof AiError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 502 });
    const issues = (error as { issues?: Array<{ message?: string; path?: unknown[] }> })?.issues;
    if (Array.isArray(issues) && issues[0]?.message) {
        return NextResponse.json({ success: false, error: `${issues[0].path?.join(".") ?? "input"}: ${issues[0].message}` }, { status: 400 });
    }
    console.error(fallback, error);
    // The cause travels to the admin screen, so a failure never shows as a bare "general error".
    const detail = (error instanceof Error ? error.message : String(error ?? "")).slice(0, 300);
    return NextResponse.json({ success: false, error: fallback, ...(detail ? { detail } : {}) }, { status: 500 });
}

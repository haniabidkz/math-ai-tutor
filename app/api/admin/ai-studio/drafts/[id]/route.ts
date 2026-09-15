import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { draftEditSchema } from "@/lib/ai-studio/input";
import {
    assertOpen, clean, draftFrom, draftsCollection, liveQuestionTexts, loadDraft,
    studioErrorResponse, StudioError, toClientDraft,
} from "@/lib/ai-studio/store";
import { OPTION_LETTERS, type DraftQuestion, type GenerationDraft } from "@/lib/ai-studio/types";
import { questionFingerprint } from "@/lib/ai-studio/validate";
import { requireSuperAdmin } from "@/lib/server-auth";

type Context = { params: Promise<{ id: string }> };

/** The draft, plus the live question texts it is checked against for repeats. */
export async function GET(request: NextRequest, context: Context) {
    try {
        await requireSuperAdmin(request);
        const { id } = await context.params;
        const draft = await loadDraft(id);
        const liveTexts = await liveQuestionTexts(draft.target.microTopics.map((topic) => topic.microTag));
        return NextResponse.json({ success: true, draft: toClientDraft(draft), liveTexts });
    } catch (error) {
        return studioErrorResponse(error, "The draft could not be loaded");
    }
}

function blankQuestion(difficulty: DraftQuestion["difficulty"], microTag: string): DraftQuestion {
    return {
        key: randomUUID(),
        difficulty,
        microTag,
        questionText: "",
        options: ["", "", "", ""],
        correctOption: "A",
        hint: { english: "", romanUrdu: "" },
        solution: { english: "", romanUrdu: "" },
        wrongReasons: {},
        verification: { status: "pending" },
        origin: "manual",
    };
}

/**
 * One edit at a time, applied to the latest saved draft inside a transaction so an edit
 * never overwrites questions that a generation step added in the meantime.
 */
export async function PATCH(request: NextRequest, context: Context) {
    try {
        await requireSuperAdmin(request);
        const { id } = await context.params;
        const edit = draftEditSchema.parse(await request.json());
        const ref = draftsCollection().doc(id);
        let addedKey: string | null = null;

        const updated = await adminDb.runTransaction(async (transaction) => {
            const draft = draftFrom(await transaction.get(ref));
            assertOpen(draft);
            const find = (key: string) => {
                const found = draft.questions.find((question) => question.key === key);
                if (!found) throw new StudioError(404, "That question is no longer in the draft.");
                return found;
            };
            const replace = (next: DraftQuestion) => draft.questions.map((question) => (question.key === next.key ? next : question));
            let changes: Partial<GenerationDraft> = {};

            switch (edit.op) {
                case "concept":
                    changes = { concept: edit.concept };
                    break;
                case "question": {
                    const stored = find(edit.question.key);
                    const next: DraftQuestion = { ...stored, ...edit.question, wrongReasons: {} };
                    // Only reasons for the three wrong options are kept.
                    for (const letter of OPTION_LETTERS) {
                        const reason = edit.question.wrongReasons[letter];
                        if (letter !== next.correctOption && reason) next.wrongReasons[letter] = reason;
                    }
                    // Changing what a solver sees (text, options or answer) needs a fresh check.
                    if (questionFingerprint(next) !== questionFingerprint(stored)) next.verification = { status: "pending" };
                    changes = { questions: replace(next) };
                    break;
                }
                case "add": {
                    const question = blankQuestion(edit.difficulty, draft.target.microTopics[0]?.microTag ?? "");
                    addedKey = question.key;
                    changes = { questions: [...draft.questions, question] };
                    break;
                }
                case "remove":
                    find(edit.key);
                    changes = { questions: draft.questions.filter((question) => question.key !== edit.key) };
                    break;
                case "confirm": {
                    const stored = find(edit.key);
                    changes = { questions: replace({ ...stored, verification: { ...stored.verification, status: "confirmed", fingerprint: questionFingerprint(stored) } }) };
                    break;
                }
                case "recheck": {
                    const stored = find(edit.key);
                    changes = { questions: replace({ ...stored, verification: { status: "pending" } }) };
                    break;
                }
                case "skipStep": {
                    const step = draft.steps.find((item) => item.id === edit.stepId);
                    if (!step || step.status !== "failed") throw new StudioError(409, "Only a failed step can be skipped.");
                    const steps = draft.steps.map((item) => (item.id === edit.stepId ? { ...item, status: "done" as const, error: "Skipped: add these questions by hand." } : item));
                    changes = { steps, ...(steps.every((item) => item.status === "done") ? { status: "needs_review" as const } : {}) };
                    break;
                }
            }

            transaction.update(ref, { ...clean(changes), updatedAt: FieldValue.serverTimestamp() });
            return { ...draft, ...changes };
        });

        return NextResponse.json({ success: true, draft: toClientDraft(updated), addedKey });
    } catch (error) {
        return studioErrorResponse(error, "The change could not be saved");
    }
}

/** Discarding keeps the record for the audit trail but hides it from the Studio. */
export async function DELETE(request: NextRequest, context: Context) {
    try {
        const admin = await requireSuperAdmin(request);
        const { id } = await context.params;
        const ref = draftsCollection().doc(id);
        await adminDb.runTransaction(async (transaction) => {
            const draft = draftFrom(await transaction.get(ref));
            assertOpen(draft);
            transaction.update(ref, { status: "discarded", updatedAt: FieldValue.serverTimestamp() });
        });
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: "aiStudio.draft.discard", targetType: "generationDraft", targetId: id, summary: "Discarded an AI Studio draft" });
        return NextResponse.json({ success: true });
    } catch (error) {
        return studioErrorResponse(error, "The draft could not be discarded");
    }
}

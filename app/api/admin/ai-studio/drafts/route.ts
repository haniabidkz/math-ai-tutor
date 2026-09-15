import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { writeAuditLog } from "@/lib/admin-audit";
import { effectiveConfig } from "@/lib/config-validation";
import { createDraftSchema } from "@/lib/ai-studio/input";
import { planSteps, quotaFor, quotaTotal } from "@/lib/ai-studio/quotas";
import { allConcepts, draftsCollection, studioErrorResponse, StudioError } from "@/lib/ai-studio/store";
import { buildTarget } from "@/lib/ai-studio/target";
import { CURRICULUM_NAME, type GenerationDraft } from "@/lib/ai-studio/types";
import { requireSuperAdmin } from "@/lib/server-auth";
import type { AssessmentConfig } from "@/types/curriculum";

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const snapshot = await draftsCollection().orderBy("createdAt", "desc").limit(40).get();
        const drafts = snapshot.docs
            .map((doc) => ({ ...(doc.data() as GenerationDraft), id: doc.id }))
            .filter((draft) => draft.status !== "discarded")
            .map((draft) => ({
                id: draft.id,
                status: draft.status,
                level: draft.level,
                classLevel: draft.target.classLevel,
                chapter: draft.target.chapter.title,
                subTopic: draft.target.subTopic,
                microTopic: draft.target.microTopic?.title ?? null,
                questionCount: draft.questions.length,
                total: quotaTotal(draft.quota),
                stepsDone: draft.steps.filter((step) => step.status === "done").length,
                stepsTotal: draft.steps.length,
                createdByEmail: draft.createdByEmail,
                createdAt: (draft.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? null,
            }));
        return NextResponse.json({ success: true, drafts });
    } catch (error) {
        return studioErrorResponse(error, "Drafts could not be loaded");
    }
}

/** Saves the request as a draft with its exact quota and plan; the browser then runs each step. */
export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const input = createDraftSchema.parse(await request.json());
        const [concepts, configDoc] = await Promise.all([
            allConcepts(),
            adminDb.collection("assessmentConfigs").doc("default").get(),
        ]);
        const built = buildTarget(input, concepts);
        if ("error" in built) throw new StudioError(400, built.error);

        const quota = quotaFor(input.level, effectiveConfig(configDoc.data() as Partial<AssessmentConfig> | undefined));
        const ref = draftsCollection().doc();
        await ref.set({
            status: "generating",
            level: input.level,
            curriculum: CURRICULUM_NAME,
            target: built.target,
            quota,
            concept: null,
            questions: [],
            steps: planSteps(quota),
            usage: { calls: 0, inputTokens: 0, outputTokens: 0 },
            createdBy: admin.uid,
            createdByEmail: admin.email,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
        });
        const name = built.target.microTopic?.title ?? built.target.subTopic ?? built.target.chapter.title;
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: "aiStudio.draft.create", targetType: "generationDraft", targetId: ref.id, summary: `Started ${input.level}-topic pool for ${name} (${quotaTotal(quota)} questions)` });
        return NextResponse.json({ success: true, id: ref.id }, { status: 201 });
    } catch (error) {
        return studioErrorResponse(error, "The draft could not be created");
    }
}

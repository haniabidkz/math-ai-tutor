import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { writeAuditLog } from "@/lib/admin-audit";
import { proposeSequence } from "@/lib/ai-studio/sequence";
import { allConcepts, studioErrorResponse } from "@/lib/ai-studio/store";
import { CURRICULUM_NAME } from "@/lib/ai-studio/types";
import { classOutline } from "@/lib/curriculum-order";
import { adminDb } from "@/lib/firebase-admin";
import { requireSuperAdmin } from "@/lib/server-auth";
import type { MicroConcept } from "@/types/curriculum";

export const maxDuration = 300;

const bodySchema = z.object({
    classLevel: z.union([z.literal(6), z.literal(7), z.literal(8)]),
    /** False: only show the textbook order; true: write it to the lessons. */
    apply: z.boolean().optional().default(false),
});

/**
 * Orders a whole class the way its textbook does: the model proposes the order, the code checks
 * that nothing was lost or moved between chapters, and with `apply` the ordering fields are
 * written so every screen shows that order from then on.
 */
export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const { classLevel, apply } = bodySchema.parse(await request.json());
        const concepts = await allConcepts();
        const before = classOutline(concepts, classLevel);
        const result = await proposeSequence(concepts, classLevel);

        const byTag = new Map(concepts.map((concept) => [concept.microTag, concept]));
        const after: MicroConcept[] = concepts.map((concept) => {
            const placement = result.placements.find((item) => item.microTag === concept.microTag);
            if (!placement) return concept;
            return {
                ...concept,
                topicOrder: placement.topicOrder,
                subTopicOrder: placement.subTopicOrder,
                order: placement.order,
                ...(placement.subTopic && !concept.subTopic?.english ? { subTopic: { english: placement.subTopic, romanUrdu: placement.subTopic } } : {}),
                sequence: { source: "ai" as const, textbook: CURRICULUM_NAME },
            };
        });
        const proposed = classOutline(after, classLevel);
        // A lesson "moves" when its place in the class or its sub-topic changes; renumbering alone does not count.
        const flat = (outline: ReturnType<typeof classOutline>) => outline.flatMap((chapter) => chapter.subTopics.flatMap((group) => group.lessons.map((lesson) => ({ microTag: lesson.microTag, group: `${chapter.topicId}/${group.name ?? ""}` }))));
        const was = flat(before);
        const changed = flat(proposed)
            .filter((item, index) => was[index]?.microTag !== item.microTag || was.find((entry) => entry.microTag === item.microTag)?.group !== item.group)
            .map((item) => item.microTag);

        if (apply) {
            const stored = new Set((await adminDb.collection("microConcepts").select().get()).docs.map((doc) => doc.id));
            for (let start = 0; start < result.placements.length; start += 400) {
                const batch = adminDb.batch();
                for (const placement of result.placements.slice(start, start + 400)) {
                    const current = byTag.get(placement.microTag);
                    // Bundled lessons that were never stored are written in full, so the order sticks.
                    const base = stored.has(placement.microTag) ? {} : { ...current };
                    batch.set(adminDb.collection("microConcepts").doc(placement.microTag), {
                        ...base,
                        topicOrder: placement.topicOrder,
                        subTopicOrder: placement.subTopicOrder,
                        order: placement.order,
                        ...(placement.subTopic && !current?.subTopic?.english ? { subTopic: { english: placement.subTopic, romanUrdu: placement.subTopic } } : {}),
                        sequence: { source: "ai", textbook: CURRICULUM_NAME, note: result.notes.slice(0, 300), updatedAt: FieldValue.serverTimestamp() },
                        updatedBy: admin.uid,
                        updatedAt: FieldValue.serverTimestamp(),
                    }, { merge: true });
                }
                await batch.commit();
            }
            await writeAuditLog({
                actorUid: admin.uid, actorEmail: admin.email, action: "curriculum.sequence", targetType: "class", targetId: String(classLevel),
                summary: `Ordered Class ${classLevel} by ${CURRICULUM_NAME} with ${result.model}: ${changed.length} lesson(s) moved. ${result.notes}`.slice(0, 500),
            });
        }
        return NextResponse.json({ success: true, classLevel, before, after: proposed, changed, notes: result.notes, model: result.model, applied: apply });
    } catch (error) {
        return studioErrorResponse(error, "The class could not be ordered");
    }
}

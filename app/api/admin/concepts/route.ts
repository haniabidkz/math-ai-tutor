import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { conceptInputSchema } from "@/lib/admin-schemas";
import { writeAuditLog } from "@/lib/admin-audit";
import { builtInCurriculumEnabled, getConcept } from "@/lib/curriculum";
import { findSimilarChapter, normalizeTitle, topicsForClass } from "@/lib/concept-autofill";
import { getRuntimeConcepts } from "@/lib/assessment-content";
import { activityDateKey } from "@/lib/gamification";
import { contentNotification } from "@/lib/notifications";
import { notifyClass } from "@/lib/notifications-server";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";
import type { MicroConcept } from "@/types/curriculum";

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const snapshot = await adminDb.collection("microConcepts").get();
        const concepts = snapshot.docs
            .map((doc) => ({ ...doc.data(), microTag: doc.id }) as MicroConcept)
            .sort((left, right) => left.classLevel - right.classLevel || left.topicId.localeCompare(right.topicId) || left.order - right.order);
        return NextResponse.json({ success: true, concepts });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to load concepts" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const body = await request.json();
        const parsed = conceptInputSchema.parse(body);
        if (parsed.prerequisiteTag === parsed.microTag) return NextResponse.json({ success: false, error: "A concept cannot require itself" }, { status: 400 });

        const ref = adminDb.collection("microConcepts").doc(parsed.microTag);
        const before = await ref.get();
        // A new concept must not silently replace one that already uses this tag.
        if (body.isNew === true && (before.exists || (builtInCurriculumEnabled() && getConcept(parsed.microTag)))) {
            return NextResponse.json({ success: false, error: `A concept with the tag ${parsed.microTag} already exists. Change the title slightly.` }, { status: 409 });
        }
        const wasPublished = before.data()?.status === "published";

        // A new chapter must not be a second spelling of one the class already has.
        const chapters = topicsForClass((await getRuntimeConcepts()).filter((concept) => concept.microTag !== parsed.microTag), parsed.classLevel);
        if (!chapters.some((chapter) => chapter.topicId === parsed.topicId)) {
            const similar = findSimilarChapter(parsed.topicTitle.english, chapters);
            if (similar && normalizeTitle(similar.title.english) !== normalizeTitle(parsed.topicTitle.english)) {
                return NextResponse.json({ success: false, error: `The main topic "${parsed.topicTitle.english}" looks like "${similar.title.english}", which Class ${parsed.classLevel} already has. Use that exact name so the lesson joins it.` }, { status: 409 });
            }
            if (similar) {
                return NextResponse.json({ success: false, error: `Class ${parsed.classLevel} already has the main topic "${similar.title.english}" (${similar.topicId}). Pick it instead of creating "${parsed.topicId}".` }, { status: 409 });
            }
        }

        await ref.set({
            ...parsed,
            // Class 5 concepts, and foundations of later classes, are for diagnosis and repair only.
            foundationOnly: parsed.classLevel === 5 || parsed.foundationOnly === true,
            ...(body.isNew === true ? { createdBy: admin.uid, createdAt: FieldValue.serverTimestamp() } : {}),
            updatedBy: admin.uid,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });

        // The chapter order belongs to the chapter: every lesson in it takes the same value.
        if (typeof parsed.topicOrder === "number") {
            const siblings = await adminDb.collection("microConcepts").where("topicId", "==", parsed.topicId).where("classLevel", "==", parsed.classLevel).get();
            const batch = adminDb.batch();
            for (const doc of siblings.docs) {
                if (doc.id !== parsed.microTag && doc.data().topicOrder !== parsed.topicOrder) batch.update(doc.ref, { topicOrder: parsed.topicOrder, updatedAt: FieldValue.serverTimestamp() });
            }
            await batch.commit();
        }
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: body.isNew === true ? "concept.create" : "concept.update", targetType: "microConcept", targetId: parsed.microTag, summary: `Saved ${parsed.title.english}` });

        // A lesson that just went live for a class with a board tells its students; never a foundation-only repair topic.
        const nowPublished = parsed.status === "published" && !wasPublished;
        if (nowPublished && !(parsed.classLevel === 5 || parsed.foundationOnly === true) && [6, 7, 8].includes(parsed.classLevel)) {
            try {
                await notifyClass(parsed.classLevel, contentNotification({ microTag: parsed.microTag, title: parsed.title, classLevel: parsed.classLevel }, activityDateKey()));
            } catch (error) {
                console.error("Could not notify the class about the published lesson", error);
            }
        }
        return NextResponse.json({ success: true, microTag: parsed.microTag });
    } catch (error: any) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: error?.issues?.[0]?.message ?? "Invalid concept" }, { status: 400 });
    }
}

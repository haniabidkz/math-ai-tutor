import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { questionInputSchema } from "@/lib/admin-schemas";
import { writeAuditLog } from "@/lib/admin-audit";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const snapshot = await adminDb.collection("questions").orderBy("microTag").limit(1000).get();
        const filters = request.nextUrl.searchParams;
        const questions = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((item: any) =>
            (!filters.get("microTag") || item.microTag === filters.get("microTag")) &&
            (!filters.get("difficulty") || item.difficulty === filters.get("difficulty")) &&
            (!filters.get("status") || item.status === filters.get("status"))
        );
        return NextResponse.json({ success: true, questions });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to load questions" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const body = await request.json();
        const rawItems = Array.isArray(body.questions) ? body.questions : [body];
        if (rawItems.length > 500) return NextResponse.json({ success: false, error: "Import limit is 500 questions" }, { status: 400 });
        const parsed = rawItems.map((item: unknown) => questionInputSchema.parse(item));
        const batch = adminDb.batch();
        const ids: string[] = [];
        for (const item of parsed) {
            const id = item.id ?? `${item.microTag}-${randomUUID().slice(0, 8)}`;
            ids.push(id);
            batch.set(adminDb.collection("questions").doc(id), {
                ...item,
                id: FieldValue.delete(),
                createdBy: admin.uid,
                updatedBy: admin.uid,
                createdAt: FieldValue.serverTimestamp(),
                updatedAt: FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        await batch.commit();
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: parsed.length > 1 ? "questions.import" : "question.create", targetType: "question", targetId: ids.join(","), summary: `Created ${parsed.length} question(s)` });
        return NextResponse.json({ success: true, ids }, { status: 201 });
    } catch (error: any) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: error?.issues?.[0]?.message ?? "Invalid question payload" }, { status: 400 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const body = await request.json();
        if (!body.id) return NextResponse.json({ success: false, error: "Question id is required" }, { status: 400 });
        const parsed = questionInputSchema.parse(body);
        await adminDb.collection("questions").doc(body.id).set({ ...parsed, id: FieldValue.delete(), updatedBy: admin.uid, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: "question.update", targetType: "question", targetId: body.id, summary: `Updated ${body.id}` });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: error?.issues?.[0]?.message ?? "Invalid question payload" }, { status: 400 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const id = request.nextUrl.searchParams.get("id");
        if (!id) return NextResponse.json({ success: false, error: "Question id is required" }, { status: 400 });
        await adminDb.collection("questions").doc(id).delete();
        await writeAuditLog({ actorUid: admin.uid, actorEmail: admin.email, action: "question.delete", targetType: "question", targetId: id, summary: `Deleted ${id}` });
        return NextResponse.json({ success: true });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to delete question" }, { status: 500 });
    }
}

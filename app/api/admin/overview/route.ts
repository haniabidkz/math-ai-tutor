import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export async function GET(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const [students, parents, teachers, questions, concepts, drafts, audits] = await Promise.all([
            adminDb.collection("students").count().get(),
            adminDb.collection("parents").count().get(),
            adminDb.collection("teachers").count().get(),
            adminDb.collection("questions").count().get(),
            adminDb.collection("microConcepts").count().get(),
            adminDb.collection("questions").where("status", "==", "draft").count().get(),
            adminDb.collection("auditLogs").orderBy("createdAt", "desc").limit(20).get(),
        ]);
        return NextResponse.json({
            success: true,
            metrics: {
                students: students.data().count,
                parents: parents.data().count,
                teachers: teachers.data().count,
                questions: questions.data().count,
                concepts: concepts.data().count,
                draftQuestions: drafts.data().count,
            },
            auditLogs: audits.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Failed to load overview" }, { status: 500 });
    }
}

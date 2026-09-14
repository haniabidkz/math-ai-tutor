import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/admin-audit";
import { getPublishedConcept } from "@/lib/assessment-content";
import { getClassConcepts, isLearningConceptForClass } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { ALL_CLASSES, effectiveTeacherClasses, homeworkInputSchema, homeworkStatus, isOverdue, sortHomework } from "@/lib/homework";
import { authErrorResponse, requireUser } from "@/lib/server-auth";
import type { StudentClassLevel } from "@/types/curriculum";
import type { HomeworkAssignment, StudentHomework } from "@/types/homework";

function toAssignment(id: string, data: FirebaseFirestore.DocumentData): HomeworkAssignment {
    return {
        id,
        microTag: data.microTag,
        title: data.title,
        topicTitle: data.topicTitle,
        classLevel: data.classLevel,
        questionCount: data.questionCount,
        dueDate: data.dueDate,
        allStudents: data.allStudents === true,
        studentUids: Array.isArray(data.studentUids) ? data.studentUids : [],
        assignedByUid: data.assignedByUid,
        assignedByEmail: data.assignedByEmail,
        note: data.note,
        packetId: data.packetId ?? null,
        packetTitle: data.packetTitle ?? null,
    };
}

/** Homework reaches a student either through a whole-class assignment or by name. */
async function homeworkForStudent(uid: string, classLevel: StudentClassLevel): Promise<StudentHomework[]> {
    const [classWide, named, progress] = await Promise.all([
        adminDb.collection("homework").where("classLevel", "==", classLevel).where("allStudents", "==", true).get(),
        adminDb.collection("homework").where("studentUids", "array-contains", uid).get(),
        adminDb.collection("students").doc(uid).collection("homeworkProgress").get(),
    ]);

    const progressById = new Map(progress.docs.map((doc) => [doc.id, doc.data()]));
    const assignments = new Map<string, HomeworkAssignment>();
    for (const doc of [...classWide.docs, ...named.docs]) assignments.set(doc.id, toAssignment(doc.id, doc.data()));

    const items = [...assignments.values()].map((assignment) => {
        const record = progressById.get(assignment.id);
        const status = homeworkStatus(record);
        return {
            ...assignment,
            status,
            percentage: typeof record?.percentage === "number" ? record.percentage : null,
            completedAt: record?.completedAt?.toDate?.()?.toISOString() ?? null,
            overdue: isOverdue(assignment.dueDate, status),
        } satisfies StudentHomework;
    });
    return sortHomework(items);
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student", "teacher", "super_admin"]);

        if (user.role === "student") {
            const profile = (await adminDb.collection("students").doc(user.uid).get()).data() ?? {};
            const classLevel = Number(profile.class) as StudentClassLevel;
            if (![6, 7, 8].includes(classLevel)) {
                return NextResponse.json({ success: false, error: "Student class must be 6, 7, or 8" }, { status: 409 });
            }
            return NextResponse.json({ success: true, homework: await homeworkForStudent(user.uid, classLevel) });
        }

        // Teachers see their own classes; admins see every class.
        const teacherDoc = user.role === "teacher" ? await adminDb.collection("teachers").doc(user.uid).get() : null;
        const assignedClasses = teacherDoc?.data()?.assignedClasses;
        const classes = user.role === "teacher" ? effectiveTeacherClasses(assignedClasses) : [...ALL_CLASSES];
        const hasAssignedClasses = user.role !== "teacher" || (Array.isArray(assignedClasses) && assignedClasses.length > 0);

        const [snapshot, ...counts] = await Promise.all([
            adminDb.collection("homework").orderBy("createdAt", "desc").limit(200).get(),
            ...classes.map((level) => adminDb.collection("students").where("class", "==", level).count().get()),
        ]);
        return NextResponse.json({
            success: true,
            myClasses: classes.map((classLevel, index) => ({ classLevel, students: counts[index].data().count })),
            hasAssignedClasses,
            homework: snapshot.docs
                .map((doc) => toAssignment(doc.id, doc.data()))
                .filter((item) => classes.includes(item.classLevel)),
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load homework" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await requireUser(request, ["teacher", "super_admin"]);
        const parsed = homeworkInputSchema.parse(await request.json());

        if (user.role === "teacher") {
            const teacher = await adminDb.collection("teachers").doc(user.uid).get();
            const allowed = effectiveTeacherClasses(teacher.data()?.assignedClasses);
            if (!allowed.includes(parsed.classLevel)) {
                return NextResponse.json({
                    success: false,
                    error: `You can assign homework to your classes only (Class ${allowed.join(", ")}).`,
                }, { status: 403 });
            }
        }

        // Every module in a packet must exist and belong to the class being assigned.
        const concepts = await Promise.all(parsed.microTags.map((microTag) => getPublishedConcept(microTag)));
        for (const [index, concept] of concepts.entries()) {
            if (!concept) return NextResponse.json({ success: false, error: `Module ${parsed.microTags[index]} was not found` }, { status: 404 });
            if (!isLearningConceptForClass(concept, parsed.classLevel)) {
                const available = getClassConcepts(parsed.classLevel).length;
                return NextResponse.json({
                    success: false,
                    error: `${concept.microTag} is not a Class ${parsed.classLevel} module (${available} available)`,
                }, { status: 400 });
            }
        }

        const packetId = concepts.length > 1 ? `packet_${randomUUID()}` : null;
        const packetTitle = packetId ? parsed.packetTitle || `${concepts.length}-module homework packet` : null;
        const batch = adminDb.batch();
        const ids: string[] = [];
        for (const concept of concepts) {
            const id = `hw_${randomUUID()}`;
            ids.push(id);
            batch.set(adminDb.collection("homework").doc(id), {
                microTag: concept!.microTag,
                title: concept!.title,
                topicTitle: concept!.topicTitle,
                classLevel: parsed.classLevel,
                questionCount: parsed.questionCount,
                dueDate: parsed.dueDate,
                allStudents: parsed.allStudents,
                studentUids: parsed.allStudents ? [] : parsed.studentUids,
                assignedByUid: user.uid,
                assignedByEmail: user.email,
                ...(packetId ? { packetId, packetTitle } : {}),
                ...(parsed.note ? { note: parsed.note } : {}),
                createdAt: FieldValue.serverTimestamp(),
            });
        }
        await batch.commit();

        await writeAuditLog({
            actorUid: user.uid,
            actorEmail: user.email,
            action: packetId ? "homework.assignPacket" : "homework.assign",
            targetType: "homework",
            targetId: ids.join(","),
            summary: `Assigned ${parsed.microTags.join(", ")} to Class ${parsed.classLevel} (due ${parsed.dueDate})`,
        });

        return NextResponse.json({ success: true, id: ids[0], ids, packetId }, { status: 201 });
    } catch (error: unknown) {
        const auth = authErrorResponse(error);
        if (auth) return NextResponse.json(auth.body, { status: auth.status });
        const issues = (error as { issues?: Array<{ message?: string }> }).issues;
        return NextResponse.json({
            success: false,
            error: issues?.[0]?.message ?? (error instanceof Error ? error.message : "Invalid homework"),
        }, { status: 400 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = await requireUser(request, ["teacher", "super_admin"]);
        const id = request.nextUrl.searchParams.get("id");
        if (!id) return NextResponse.json({ success: false, error: "Homework id is required" }, { status: 400 });
        await adminDb.collection("homework").doc(id).delete();
        await writeAuditLog({
            actorUid: user.uid,
            actorEmail: user.email,
            action: "homework.delete",
            targetType: "homework",
            targetId: id,
            summary: `Removed homework ${id}`,
        });
        return NextResponse.json({ success: true });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to delete homework" }, { status: 500 });
    }
}

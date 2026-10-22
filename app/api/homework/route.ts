import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { freeScopeLabel, teacherCanAssignLockedLessons, type PlanState } from "@/lib/access";
import { writeAuditLog } from "@/lib/admin-audit";
import { getPublishedConcept, getRuntimeConcepts } from "@/lib/assessment-content";
import { groupTopics, isLearningConceptForClass } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { ALL_CLASSES, effectiveTeacherClasses, homeworkInputSchema, homeworkReachesStudent, homeworkStatus, isOverdue, sortHomework, type HomeworkAudience } from "@/lib/homework";
import { lessonOpenFor, lessonPositions } from "@/lib/learner-metrics";
import { getAccessSettings, listSections } from "@/lib/schools-server";
import { authErrorResponse, requireUser, type AuthenticatedUser } from "@/lib/server-auth";
import type { StudentClassLevel } from "@/types/curriculum";
import type { HomeworkAssignment, StudentHomework } from "@/types/homework";
import type { SchoolSection } from "@/types/school";

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
        schoolId: typeof data.schoolId === "string" && data.schoolId ? data.schoolId : null,
        sectionId: typeof data.sectionId === "string" && data.sectionId ? data.sectionId : null,
        sectionLabel: typeof data.sectionLabel === "string" ? data.sectionLabel : null,
    };
}

/** Homework reaches a student either through a whole-class assignment or by name. */
async function homeworkForStudent(student: HomeworkAudience): Promise<StudentHomework[]> {
    const [classWide, named, progress] = await Promise.all([
        adminDb.collection("homework").where("classLevel", "==", student.classLevel).where("allStudents", "==", true).get(),
        adminDb.collection("homework").where("studentUids", "array-contains", student.uid).get(),
        adminDb.collection("students").doc(student.uid).collection("homeworkProgress").get(),
    ]);

    const progressById = new Map(progress.docs.map((doc) => [doc.id, doc.data()]));
    const assignments = new Map<string, HomeworkAssignment>();
    for (const doc of [...classWide.docs, ...named.docs]) {
        if (homeworkReachesStudent(doc.data(), student)) assignments.set(doc.id, toAssignment(doc.id, doc.data()));
    }

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

interface TeacherScope {
    classes: Array<6 | 7 | 8>;
    hasAssignedClasses: boolean;
    schoolId: string | null;
    /** A school teacher limited to some sections; null means every section (or no school). */
    sectionIds: string[] | null;
    sections: SchoolSection[];
    plan: PlanState | null;
    /** True when the school's plan has ended: homework can be set from the free lessons only. */
    lockedAssignments: boolean;
    freeChapterCount: number;
    freeLessonsPerChapter: number;
}

/** What a teacher may assign to, and within which school. The super admin may assign anywhere. */
async function teacherScope(user: AuthenticatedUser): Promise<TeacherScope> {
    const settings = await getAccessSettings();
    if (user.role !== "teacher") {
        return { classes: [...ALL_CLASSES], hasAssignedClasses: true, schoolId: null, sectionIds: null, sections: [], plan: null, lockedAssignments: false, freeChapterCount: settings.freeChapterCount, freeLessonsPerChapter: settings.freeLessonsPerChapter };
    }
    const profile = user.profile ?? {};
    const assigned = profile.assignedClasses;
    const assignedSections = Array.isArray(profile.assignedSectionIds) ? profile.assignedSectionIds.map(String).filter(Boolean) : [];
    const sections = user.schoolId ? await listSections(user.schoolId, false) : [];
    const plan = user.school?.effectivePlan ?? null;
    return {
        classes: effectiveTeacherClasses(assigned),
        hasAssignedClasses: Boolean(user.schoolId) || (Array.isArray(assigned) && assigned.length > 0),
        schoolId: user.schoolId,
        sectionIds: assignedSections.length ? assignedSections : null,
        sections: assignedSections.length ? sections.filter((section) => assignedSections.includes(section.id)) : sections,
        plan,
        lockedAssignments: Boolean(user.schoolId) && !teacherCanAssignLockedLessons(plan),
        freeChapterCount: settings.freeChapterCount,
        freeLessonsPerChapter: settings.freeLessonsPerChapter,
    };
}

/** The free-lesson rule as the expired school's teacher must follow it. */
const basicAccess = (scope: TeacherScope) => ({ curriculum: "basic" as const, freeChapterCount: scope.freeChapterCount, freeLessonsPerChapter: scope.freeLessonsPerChapter });

/** Students per class inside the teacher's scope, for the class picker. */
async function classCounts(scope: TeacherScope, user: AuthenticatedUser): Promise<Array<{ classLevel: 6 | 7 | 8; students: number }>> {
    const counts = new Map<number, number>();
    if (scope.schoolId) {
        const snapshot = await adminDb.collection("students").where("schoolId", "==", scope.schoolId).select("class", "sectionId", "schoolStatus").get();
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.schoolStatus === "graduated") continue;
            if (scope.sectionIds && !(typeof data.sectionId === "string" && scope.sectionIds.includes(data.sectionId))) continue;
            counts.set(Number(data.class), (counts.get(Number(data.class)) ?? 0) + 1);
        }
    } else {
        // Individual teachers count individual students only; the super admin counts everyone.
        const results = await Promise.all(scope.classes.map(async (level) => {
            if (user.role !== "teacher") return [level, (await adminDb.collection("students").where("class", "==", level).count().get()).data().count] as const;
            const docs = await adminDb.collection("students").where("class", "==", level).select("schoolId").get();
            return [level, docs.docs.filter((doc) => !doc.data().schoolId).length] as const;
        }));
        for (const [level, count] of results) counts.set(level, count);
    }
    return scope.classes.map((classLevel) => ({ classLevel, students: counts.get(classLevel) ?? 0 }));
}

export async function GET(request: NextRequest) {
    try {
        const user = await requireUser(request, ["student", "teacher", "super_admin"]);

        if (user.role === "student") {
            const profile = user.profile ?? {};
            const classLevel = Number(profile.class) as StudentClassLevel;
            if (![6, 7, 8].includes(classLevel)) {
                return NextResponse.json({ success: false, error: "Student class must be 6, 7, or 8" }, { status: 409 });
            }
            const student: HomeworkAudience = { uid: user.uid, classLevel, schoolId: user.schoolId, sectionId: typeof profile.sectionId === "string" ? profile.sectionId : null };
            return NextResponse.json({ success: true, homework: await homeworkForStudent(student) });
        }

        // Teachers see their own classes inside their own school; admins see every class.
        const scope = await teacherScope(user);
        const [snapshot, concepts, myClasses] = await Promise.all([
            adminDb.collection("homework").orderBy("createdAt", "desc").limit(200).get(),
            getRuntimeConcepts(),
            classCounts(scope, user),
        ]);
        return NextResponse.json({
            success: true,
            myClasses,
            // The modules a teacher can assign are the lessons that exist now, chapter by chapter.
            modules: Object.fromEntries(scope.classes.map((classLevel) => {
                const positions = lessonPositions(concepts, classLevel);
                const lockedLesson = (microTag: string) => scope.lockedAssignments && !lessonOpenFor(positions.get(microTag), basicAccess(scope));
                return [classLevel, groupTopics(
                    concepts.filter((concept) => isLearningConceptForClass(concept, classLevel)),
                ).map((topic) => ({
                    topicId: topic.topicId,
                    title: topic.title,
                    locked: topic.concepts.every((concept) => lockedLesson(concept.microTag)),
                    concepts: topic.concepts.map((concept) => ({ microTag: concept.microTag, title: concept.title, locked: lockedLesson(concept.microTag) })),
                }))];
            })),
            hasAssignedClasses: scope.hasAssignedClasses,
            scope: {
                schoolId: scope.schoolId,
                schoolName: user.school?.name ?? null,
                plan: scope.plan,
                sections: scope.sections,
                lockedAssignments: scope.lockedAssignments,
                freeChapterCount: scope.freeChapterCount,
                freeLessonsPerChapter: scope.freeLessonsPerChapter,
            },
            homework: snapshot.docs
                .map((doc) => toAssignment(doc.id, doc.data()))
                .filter((item) => scope.classes.includes(item.classLevel))
                .filter((item) => user.role !== "teacher" || (item.schoolId ?? null) === scope.schoolId),
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
        const scope = await teacherScope(user);

        if (user.role === "teacher" && !scope.classes.includes(parsed.classLevel)) {
            return NextResponse.json({
                success: false,
                error: `You can assign homework to your classes only (Class ${scope.classes.join(", ")}).`,
            }, { status: 403 });
        }

        // Inside a school, whole-class homework may be aimed at one section, and a teacher with
        // sections must choose one of them; named students must belong to the school.
        let section: SchoolSection | null = null;
        if (scope.schoolId) {
            if (parsed.sectionId) {
                section = scope.sections.find((item) => item.id === parsed.sectionId) ?? null;
                if (!section) return NextResponse.json({ success: false, error: "Choose one of your own sections" }, { status: 403 });
                if (section.classLevel !== parsed.classLevel) return NextResponse.json({ success: false, error: `${section.label} is a Class ${section.classLevel} section` }, { status: 400 });
            } else if (parsed.allStudents && scope.sectionIds) {
                return NextResponse.json({ success: false, error: "Choose a section for whole-class homework" }, { status: 400 });
            }
            if (!parsed.allStudents && parsed.studentUids.length) {
                const docs = await adminDb.getAll(...parsed.studentUids.map((uid) => adminDb.collection("students").doc(uid)));
                const outsider = docs.find((doc) => doc.data()?.schoolId !== scope.schoolId || (scope.sectionIds && !scope.sectionIds.includes(String(doc.data()?.sectionId ?? ""))));
                if (outsider) return NextResponse.json({ success: false, error: "One of the chosen students is not in your school or sections", code: "FORBIDDEN_CROSS_TENANT" }, { status: 403 });
            }
        }

        // Every module in a packet must exist and belong to the class being assigned.
        const concepts = await Promise.all(parsed.microTags.map((microTag) => getPublishedConcept(microTag)));
        const positions = scope.lockedAssignments ? lessonPositions(await getRuntimeConcepts(), parsed.classLevel) : null;
        for (const [index, concept] of concepts.entries()) {
            if (!concept) return NextResponse.json({ success: false, error: `Module ${parsed.microTags[index]} was not found` }, { status: 404 });
            if (!isLearningConceptForClass(concept, parsed.classLevel)) {
                return NextResponse.json({
                    success: false,
                    error: `${concept.microTag} is not a Class ${parsed.classLevel} module`,
                }, { status: 400 });
            }
            if (positions && !lessonOpenFor(positions.get(concept.microTag), basicAccess(scope))) {
                return NextResponse.json({
                    success: false,
                    code: "PLAN_EXPIRED",
                    error: `Your school's plan has ended, so homework can be set from ${freeScopeLabel(basicAccess(scope))} only. "${concept.title.english}" is outside that.`,
                }, { status: 403 });
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
                schoolId: scope.schoolId,
                sectionId: section?.id ?? null,
                sectionLabel: section?.label ?? null,
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
            summary: `Assigned ${parsed.microTags.join(", ")} to Class ${parsed.classLevel}${section ? ` (${section.label})` : ""} (due ${parsed.dueDate})`,
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
        const ref = adminDb.collection("homework").doc(id);
        const data = (await ref.get()).data();
        if (!data) return NextResponse.json({ success: false, error: "Homework not found" }, { status: 404 });
        // A teacher removes their own homework, or their school's; never another school's.
        const schoolId = typeof data.schoolId === "string" && data.schoolId ? data.schoolId : null;
        if (user.role === "teacher" && data.assignedByUid !== user.uid && (!user.schoolId || schoolId !== user.schoolId)) {
            return NextResponse.json({ success: false, error: "You can remove your own homework only", code: "FORBIDDEN_CROSS_TENANT" }, { status: 403 });
        }
        await ref.delete();
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

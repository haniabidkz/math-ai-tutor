import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getPublishedConcept, localized } from "@/lib/assessment-content";
import { getClassConcepts, getConcept } from "@/lib/curriculum";
import { adminDb } from "@/lib/firebase-admin";
import { authErrorResponse, requireVerifiedUser } from "@/lib/server-auth";
import type { Locale, StudentClassLevel } from "@/types/curriculum";

function resolveMicroTag(value: string, classLevel: number) {
    if (getConcept(value)) return value;
    if (classLevel === 6 || classLevel === 7 || classLevel === 8) {
        return getClassConcepts(classLevel as StudentClassLevel).find((concept) => concept.topicId === value)?.microTag ?? value;
    }
    return value;
}

export async function POST(request: NextRequest) {
    try {
        await requireVerifiedUser(request, ["student"]);
        const body = await request.json();
        const microTag = resolveMicroTag(String(body.microTag ?? body.topicId ?? ""), Number(body.classLevel));
        const locale: Locale = body.locale === "roman-urdu" || body.language === "roman-urdu" ? "roman-urdu" : "english";
        const concept = await getPublishedConcept(microTag);
        if (!concept) return NextResponse.json({ success: false, error: "Published concept not found" }, { status: 404 });

        const title = localized(concept.title, locale);
        const summary = localized(concept.concept, locale);
        const prerequisite = concept.prerequisiteTag ? await getPublishedConcept(concept.prerequisiteTag) : null;
        const level = Math.max(1, Math.min(3, Number(body.teachingLevel ?? 1)));
        const extra = locale === "roman-urdu"
            ? level === 1 ? "**Yaad rakhein:** Har qadam ko alag likhein aur akhir mein apna jawab check karein."
                : level === 2 ? "**Tareeqa:** Maloom qeemat pehchanein, aik amal chunein, phir qadam ba qadam hal karein."
                    : "**Gehri jaanch:** Apna jawab sawal mein wapas rakh kar tasdeeq karein aur nishan dobara check karein."
            : level === 1 ? "**Remember:** Write each step separately and check your answer at the end."
                : level === 2 ? "**Method:** Identify known values, choose one operation, then solve one step at a time."
                    : "**Deep check:** Substitute your answer back into the problem and verify every sign.";
        const content = `## ${title}\n\n${summary}\n\n${extra}${prerequisite ? `\n\n${locale === "roman-urdu" ? "Is se pehle" : "It helps to understand"} **${localized(prerequisite.title, locale)}** ${locale === "roman-urdu" ? "ko samajhna madadgar hai." : "first."}` : ""}`;

        return NextResponse.json({
            success: true,
            content,
            concept: {
                ...concept,
                title,
                concept: summary,
                topicTitle: localized(concept.topicTitle, locale),
            },
        });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to load lesson" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = await requireVerifiedUser(request, ["student"]);
        const body = await request.json();
        const microTag = String(body.microTag ?? body.topicId ?? "");
        if (!microTag) return NextResponse.json({ success: false, error: "microTag is required" }, { status: 400 });
        const ref = adminDb.collection("students").doc(user.uid).collection("lessonProgress").doc(microTag);
        await ref.set({
            microTag,
            understood: body.understood === true,
            teachingAttempts: FieldValue.increment(1),
            needsHumanAttention: body.understood !== true && Number(body.teachingLevel ?? 1) >= 3,
            updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return NextResponse.json({ success: true });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth
            ? NextResponse.json(auth.body, { status: auth.status })
            : NextResponse.json({ success: false, error: "Failed to update lesson progress" }, { status: 500 });
    }
}

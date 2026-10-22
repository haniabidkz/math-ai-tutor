import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { failure, ok } from "@/lib/api-response";
import { normalizeSectionName, sectionInputSchema } from "@/lib/schools";
import { createSection, deleteSection, listSections, updateSection } from "@/lib/schools-server";
import { requireSchoolAdmin, requireSchoolStaff } from "@/lib/server-auth";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).max(20).transform(normalizeSectionName).optional(),
    active: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
    try {
        const scope = await requireSchoolStaff(request);
        const sections = await listSections(scope.schoolId);
        return ok({ sections: scope.allowedSectionIds ? sections.filter((section) => scope.allowedSectionIds!.includes(section.id)) : sections });
    } catch (error) {
        return failure(error, "Sections could not be loaded");
    }
}

export async function POST(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        const input = sectionInputSchema.parse(await request.json());
        return ok({ section: await createSection(scope.schoolId, input, scope.user) }, 201);
    } catch (error) {
        return failure(error, "The section could not be created");
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        const { id, ...update } = updateSchema.parse(await request.json());
        return ok({ section: await updateSection(scope.schoolId, id, update, scope.user) });
    } catch (error) {
        return failure(error, "The section could not be updated");
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const scope = await requireSchoolAdmin(request);
        const id = request.nextUrl.searchParams.get("id");
        if (!id) return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
        await deleteSection(scope.schoolId, id, scope.user);
        return ok({});
    } catch (error) {
        return failure(error, "The section could not be deleted");
    }
}

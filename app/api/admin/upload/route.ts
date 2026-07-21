import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebase-admin";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

export async function POST(request: NextRequest) {
    try {
        await requireSuperAdmin(request);
        const form = await request.formData();
        const image = form.get("image");
        if (!(image instanceof File)) return NextResponse.json({ success: false, error: "Image is required" }, { status: 400 });
        if (!image.type.startsWith("image/") || image.size > 2 * 1024 * 1024) return NextResponse.json({ success: false, error: "Use an image smaller than 2 MB" }, { status: 400 });
        const token = randomUUID();
        const path = `concept-images/${Date.now()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        const bucket = adminStorage.bucket();
        await bucket.file(path).save(Buffer.from(await image.arrayBuffer()), {
            metadata: { contentType: image.type, metadata: { firebaseStorageDownloadTokens: token } },
        });
        const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
        return NextResponse.json({ success: true, url });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
    }
}

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import { authErrorResponse, requireSuperAdmin } from "@/lib/server-auth";

const MAX_FIRESTORE_IMAGE_BYTES = 640 * 1024;

export async function POST(request: NextRequest) {
    try {
        const admin = await requireSuperAdmin(request);
        const form = await request.formData();
        const image = form.get("image");
        if (!(image instanceof File)) return NextResponse.json({ success: false, error: "Image is required" }, { status: 400 });
        if (!image.type.startsWith("image/") || image.size > MAX_FIRESTORE_IMAGE_BYTES) {
            return NextResponse.json({ success: false, error: "Use an image smaller than 640 KB" }, { status: 400 });
        }

        const id = randomUUID();
        await adminDb.collection("mediaAssets").doc(id).set({
            filename: image.name.replace(/[^a-zA-Z0-9._-]/g, "-"),
            contentType: image.type,
            data: Buffer.from(await image.arrayBuffer()).toString("base64"),
            size: image.size,
            createdBy: admin.uid,
            createdAt: FieldValue.serverTimestamp(),
        });
        const url = new URL(`/api/assets/${id}`, request.url).toString();
        return NextResponse.json({ success: true, url });
    } catch (error) {
        const auth = authErrorResponse(error);
        return auth ? NextResponse.json(auth.body, { status: auth.status }) : NextResponse.json({ success: false, error: "Upload failed" }, { status: 500 });
    }
}

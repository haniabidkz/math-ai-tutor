import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase-admin";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const snapshot = await adminDb.collection("mediaAssets").doc(id).get();
    if (!snapshot.exists) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const asset = snapshot.data() ?? {};
    if (typeof asset.data !== "string" || typeof asset.contentType !== "string") {
        return NextResponse.json({ error: "Asset is invalid" }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(Buffer.from(asset.data, "base64")), {
        headers: {
            "Content-Type": asset.contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    });
}

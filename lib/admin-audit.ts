import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";

export async function writeAuditLog(input: {
    actorUid: string;
    actorEmail: string;
    action: string;
    targetType: string;
    targetId: string;
    summary: string;
}) {
    await adminDb.collection("auditLogs").add({ ...input, createdAt: FieldValue.serverTimestamp() });
}

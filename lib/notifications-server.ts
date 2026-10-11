import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase-admin";
import type { NotificationInput, StudentNotification } from "@/lib/notifications";

const BATCH_LIMIT = 400;
const LIST_LIMIT = 30;

function notificationRef(uid: string, id: string) {
    return adminDb.collection("students").doc(uid).collection("notifications").doc(id);
}

/** Writes a different notification to each student, in batches; returns how many were written. */
export async function notifyEach(items: Array<{ uid: string; notification: NotificationInput }>): Promise<number> {
    const seen = new Set<string>();
    const unique = items.filter((item) => {
        const key = `${item.uid}/${item.notification.id}`;
        if (!item.uid || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    for (let start = 0; start < unique.length; start += BATCH_LIMIT) {
        const batch = adminDb.batch();
        for (const { uid, notification } of unique.slice(start, start + BATCH_LIMIT)) {
            batch.set(notificationRef(uid, notification.id), { ...notification, read: false, createdAt: FieldValue.serverTimestamp() });
        }
        await batch.commit();
    }
    return unique.length;
}

/** Writes one notification to many students. */
export function notifyStudents(uids: string[], notification: NotificationInput): Promise<number> {
    return notifyEach(uids.map((uid) => ({ uid, notification })));
}

/** Every student enrolled in a class gets the notice. */
export async function notifyClass(classLevel: number, notification: NotificationInput): Promise<number> {
    const snapshot = await adminDb.collection("students").where("class", "==", classLevel).select().get();
    return notifyStudents(snapshot.docs.map((doc) => doc.id), notification);
}

function toMillis(value: unknown): number {
    if (value && typeof value === "object" && typeof (value as { toMillis?: () => number }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
    }
    return typeof value === "number" ? value : 0;
}

export async function listNotifications(uid: string, limit = LIST_LIMIT): Promise<{ items: StudentNotification[]; unread: number }> {
    const collection = adminDb.collection("students").doc(uid).collection("notifications");
    const [snapshot, unreadCount] = await Promise.all([
        collection.orderBy("createdAt", "desc").limit(limit).get(),
        collection.where("read", "==", false).count().get(),
    ]);
    return {
        items: snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                type: data.type,
                title: data.title,
                body: data.body,
                link: data.link,
                read: data.read === true,
                createdAt: toMillis(data.createdAt),
            };
        }),
        unread: unreadCount.data().count,
    };
}

/** Marks the given notifications read, or every unread one when no ids are given. */
export async function markNotificationsRead(uid: string, ids?: string[]): Promise<number> {
    const collection = adminDb.collection("students").doc(uid).collection("notifications");
    const refs = ids?.length
        ? ids.slice(0, BATCH_LIMIT).map((id) => collection.doc(id))
        : (await collection.where("read", "==", false).limit(BATCH_LIMIT).get()).docs.map((doc) => doc.ref);
    if (!refs.length) return 0;
    const batch = adminDb.batch();
    for (const ref of refs) batch.set(ref, { read: true, readAt: FieldValue.serverTimestamp() }, { merge: true });
    await batch.commit();
    return refs.length;
}

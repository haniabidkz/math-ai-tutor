import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getAuth, Auth } from "firebase-admin/auth";
import { getFirestore, Firestore } from "firebase-admin/firestore";

// Firebase Admin SDK initialization (server-only)
// NEVER import this file on the client side

function initializeAdmin() {
    let app: App;

    if (getApps().length === 0) {
        app = initializeApp({
            credential: cert({
                projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
                clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
                    /\\n/g,
                    "\n"
                ),
            }),
        });
    } else {
        app = getApps()[0];
    }

    return {
        adminApp: app,
        adminAuth: getAuth(app),
        adminDb: getFirestore(app),
    };
}

const admin = initializeAdmin();

export const adminAuth = admin.adminAuth;
export const adminDb = admin.adminDb;
export default admin.adminApp;

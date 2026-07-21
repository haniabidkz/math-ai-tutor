import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const email = process.argv[2];
const action = process.argv[3] === "revoke" ? "revoke" : "grant";
if (!email) {
    console.error("Usage: npm run admin:grant -- user@example.com [revoke]");
    process.exit(1);
}

const app = getApps()[0] ?? initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
});
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
    let user = await auth.getUserByEmail(email);
    const claims = user.customClaims ?? {};
    if (action === "revoke") {
        const { super_admin: _removed, ...remaining } = claims;
        await auth.setCustomUserClaims(user.uid, remaining);
        await db.collection("admins").doc(user.uid).delete();
        console.log(`Revoked Super Admin from ${email}.`);
        return;
    }
    if (!user.emailVerified) {
        user = await auth.updateUser(user.uid, { emailVerified: true });
    }
    await auth.setCustomUserClaims(user.uid, { ...claims, super_admin: true, role: "super_admin" });
    await db.collection("admins").doc(user.uid).set({
        uid: user.uid,
        email,
        role: "super_admin",
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    await auth.revokeRefreshTokens(user.uid);
    console.log(`Granted Super Admin to ${email}. Sign in again to refresh claims.`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

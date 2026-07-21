import fs from "node:fs";
import path from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";

const temporaryCredential = path.join(process.cwd(), ".tools", "firebase-service-account.json");
if (fs.existsSync(temporaryCredential)) fs.unlinkSync(temporaryCredential);

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!projectId || !clientEmail || !privateKey || !storageBucket) throw new Error("Firebase environment is incomplete");

const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
let bearerToken = "";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
    return body as T;
}

async function deployRules(filename: string, releaseName: string) {
    const content = fs.readFileSync(filename, "utf8");
    const source = { files: [{ name: filename, content }] };
    const testResponse = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}:test`, {
        method: "POST",
        headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
    });
    const test = await testResponse.json().catch(() => ({})) as { issues?: Array<{ severity: string; description: string }>; error?: { message?: string } };
    if (testResponse.ok) {
        const errors = (test.issues ?? []).filter((issue) => issue.severity === "ERROR");
        if (errors.length) throw new Error(errors.map((issue) => issue.description).join("\n"));
    } else if (testResponse.status === 403) {
        console.warn(`Remote validation unavailable for ${filename}; use the emulator-tested source.`);
    } else {
        throw new Error(`${testResponse.status} ${test.error?.message ?? "Rules validation failed"}`);
    }

    const ruleset = await request<{ name: string }>(`https://firebaserules.googleapis.com/v1/projects/${projectId}/rulesets`, {
        method: "POST", body: JSON.stringify({ source }),
    });
    const name = `projects/${projectId}/releases/${releaseName}`;
    const updateUrl = `https://firebaserules.googleapis.com/v1/${name}`;
    const update = await fetch(updateUrl, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ release: { name, rulesetName: ruleset.name } }),
    });
    if (!update.ok) {
        if (update.status !== 404) throw new Error(`${update.status} ${await update.text()}`);
        const create = await fetch(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`, {
            method: "POST",
            headers: { Authorization: `Bearer ${bearerToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name, rulesetName: ruleset.name }),
        });
        if (!create.ok) {
            const reason = await create.text();
            console.warn(`Could not create the ${releaseName} release (${create.status}): ${reason}`);
            return false;
        }
    }
    console.log(`Released ${filename} to ${releaseName}.`);
    return true;
}

async function deployIndex() {
    const parent = `projects/${projectId}/databases/(default)/collectionGroups/questions`;
    const url = `https://firestore.googleapis.com/v1/${parent}/indexes`;
    const existing = await request<{ indexes?: Array<{ fields?: Array<{ fieldPath?: string }> }> }>(url);
    const fields = ["microTag", "difficulty", "status"];
    const exists = existing.indexes?.some((index) => fields.every((field, position) => index.fields?.[position]?.fieldPath === field));
    if (!exists) {
        await request(url, {
            method: "POST",
            body: JSON.stringify({ queryScope: "COLLECTION", fields: fields.map((fieldPath) => ({ fieldPath, order: "ASCENDING" })) }),
        });
        console.log("Created the question-bank composite index.");
    } else {
        console.log("Question-bank composite index is already present.");
    }
}

async function main() {
    bearerToken = (await app.options.credential!.getAccessToken()).access_token;
    await deployRules("firestore.rules", "cloud.firestore");
    const storageReleased = await deployRules("storage.rules", `firebase.storage/${storageBucket}`);
    if (!storageReleased) console.warn("Storage client rules remain unavailable; authenticated image uploads continue through the server API.");
    try {
        await deployIndex();
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("403 ")) {
            console.warn("Composite-index deployment is unavailable to this service account; current question queries do not require it.");
        } else {
            throw error;
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

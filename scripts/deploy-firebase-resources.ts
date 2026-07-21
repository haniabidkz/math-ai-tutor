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
    const test = await request<{ issues?: Array<{ severity: string; description: string }> }>(
        `https://firebaserules.googleapis.com/v1/projects/${projectId}:test`,
        { method: "POST", body: JSON.stringify({ source }) },
    );
    const errors = (test.issues ?? []).filter((issue) => issue.severity === "ERROR");
    if (errors.length) throw new Error(errors.map((issue) => issue.description).join("\n"));

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
        await request(`https://firebaserules.googleapis.com/v1/projects/${projectId}/releases`, {
            method: "POST", body: JSON.stringify({ name, rulesetName: ruleset.name }),
        });
    }
    console.log(`Released ${filename} to ${releaseName}.`);
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
    await deployRules("storage.rules", `firebase.storage/${storageBucket}`);
    await deployIndex();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

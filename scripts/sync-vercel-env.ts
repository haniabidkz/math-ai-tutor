import { spawnSync } from "node:child_process";

const keys = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "FIREBASE_ADMIN_PROJECT_ID",
    "FIREBASE_ADMIN_CLIENT_EMAIL",
    "FIREBASE_ADMIN_PRIVATE_KEY",
];

const command = "npx";
for (const target of ["preview", "production"]) {
    for (const key of keys) {
        const value = process.env[key];
        if (!value) throw new Error(`Missing ${key}`);
        const result = spawnSync(command, ["vercel", "env", "add", key, target, "--force", "--yes"], {
            cwd: process.cwd(), input: value, encoding: "utf8", windowsHide: true, shell: process.platform === "win32",
        });
        if (result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout || `Failed to set ${key}`);
        console.log(`Set ${key} for ${target}.`);
    }
}

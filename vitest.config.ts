import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
    plugins: [react()],
    resolve: { alias: { "@": path.resolve(__dirname, ".") } },
    test: {
        environment: "jsdom",
        setupFiles: ["./tests/setup.ts"],
        include: ["tests/**/*.test.{ts,tsx}"],
        coverage: {
            provider: "v8",
            reporter: ["text", "json-summary"],
            include: ["lib/adaptive-engine.ts", "lib/content-validation.ts", "lib/server-auth.ts"],
        },
    },
});

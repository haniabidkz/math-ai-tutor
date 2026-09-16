import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planSteps, DEFAULT_QUOTAS } from "@/lib/ai-studio/quotas";

const fake = vi.hoisted(() => ({
    calls: [] as Array<{ baseURL?: string; params: Record<string, any> }>,
    models: {} as Record<string, string[]>,
    respond: (() => ({})) as (baseURL: string | undefined, params: Record<string, any>) => unknown,
}));

vi.mock("openai", () => ({
    default: class {
        baseURL?: string;
        constructor(options: { baseURL?: string }) {
            this.baseURL = options.baseURL;
        }
        models = {
            list: () => {
                const ids = fake.models[this.baseURL ?? "openai"] ?? [];
                return (async function* () { for (const id of ids) yield { id }; })();
            },
        };
        chat = {
            completions: {
                create: async (params: Record<string, any>) => {
                    fake.calls.push({ baseURL: this.baseURL, params });
                    return fake.respond(this.baseURL, params);
                },
            },
        };
    },
}));

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai/";
const CEREBRAS = "https://api.cerebras.ai/v1";
const reply = (data: unknown) => ({ choices: [{ message: { content: JSON.stringify(data) }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 5 } });
const httpError = (status: number, message: string) => Object.assign(new Error(message), { status });
const schema = { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } };
const request = (role: "generation" | "verification", extra: Record<string, unknown> = {}) =>
    ({ role, system: "rules", user: "u", schemaName: "probe", schema, ...extra });

async function freshModule() {
    vi.resetModules();
    return import("@/lib/ai-studio/ai");
}

beforeEach(() => {
    fake.calls = [];
    fake.models = {
        [GEMINI]: ["models/gemini-3.8-flash", "models/gemini-3.6-flash", "models/gemini-3.5-flash", "models/gemini-2.5-flash"],
        [CEREBRAS]: ["gpt-oss-120b"],
    };
    fake.respond = () => reply({ ok: true });
    vi.stubEnv("GEMINI_API_KEY", "test-gemini");
    vi.stubEnv("CEREBRAS_API_KEY", "test-cerebras");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("AI_GENERATION_PROVIDER", "");
    vi.stubEnv("AI_VERIFICATION_PROVIDER", "");
    vi.stubEnv("GEMINI_MODEL", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("choosing the AI services", () => {
    it("writes with Gemini only, and checks with Cerebras first, then the other services with keys", async () => {
        const { providersFor } = await freshModule();
        expect(providersFor("generation").map((provider) => provider.id)).toEqual(["gemini"]);
        expect(providersFor("verification").map((provider) => provider.id)).toEqual(["cerebras", "gemini"]);
    });

    it("uses whichever keys are set, and an explicit override on its own", async () => {
        const { providerFor, providersFor } = await freshModule();
        expect(providerFor("generation", { OPENAI_API_KEY: "x" }).id).toBe("openai");
        expect(providerFor("generation", { CEREBRAS_API_KEY: "x" }).id).toBe("gemini");
        expect(providerFor("generation", { CEREBRAS_API_KEY: "x", AI_GENERATION_PROVIDER: "cerebras" }).id).toBe("cerebras");
        expect(providerFor("verification", { GEMINI_API_KEY: "x" }).id).toBe("gemini");
        expect(providersFor("verification", { CEREBRAS_API_KEY: "x", GEMINI_API_KEY: "y", AI_VERIFICATION_PROVIDER: "Gemini" }).map((provider) => provider.id)).toEqual(["gemini"]);
    });

    it("plans batches of five for Gemini, which always thinks first", async () => {
        const { questionBatchSize, checkBatchSize } = await freshModule();
        expect(questionBatchSize()).toBe(5);
        expect(checkBatchSize()).toBe(5);
        const steps = planSteps(DEFAULT_QUOTAS.micro, questionBatchSize());
        expect(steps.filter((step) => step.kind === "questions").map((step) => step.count)).toEqual([5, 5, 5, 5, 5, 5]);
    });
});

describe("JSON requests", () => {
    it("sends Gemini a strict schema with max_tokens and no temperature, using its most reliable model", async () => {
        const { completeJson } = await freshModule();
        const result = await completeJson<{ ok: boolean }>(request("generation", { temperature: 0.6, maxOutputTokens: 48_000 }));
        expect(result).toMatchObject({ data: { ok: true }, model: "gemini-3.6-flash", provider: "gemini", skipped: [] });
        const { baseURL, params } = fake.calls[0];
        expect(baseURL).toBe(GEMINI);
        expect(params.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true, schema } });
        expect(params.max_tokens).toBe(48_000);
        expect(params).not.toHaveProperty("max_completion_tokens");
        expect(params).not.toHaveProperty("temperature");
    });

    it("sends Cerebras max_completion_tokens within its free limit", async () => {
        const { completeJson } = await freshModule();
        await completeJson(request("verification", { maxOutputTokens: 30_000 }));
        expect(fake.calls[0].baseURL).toBe(CEREBRAS);
        expect(fake.calls[0].params.model).toBe("gpt-oss-120b");
        expect(fake.calls[0].params.max_completion_tokens).toBe(20_000);
    });

    it("checks answers with a different Gemini model when the Cerebras account needs billing", async () => {
        const { completeJson } = await freshModule();
        fake.respond = (baseURL) => {
            if (baseURL === CEREBRAS) throw httpError(402, "402 status code (no body)");
            return reply({ ok: true });
        };
        const result = await completeJson(request("verification"));
        expect(result).toMatchObject({ provider: "gemini", model: "gemini-3.5-flash" });
        expect(result.skipped).toEqual(["Cerebras: The Cerebras account needs billing or credits before its API can be used (HTTP 402)."]);
        expect(fake.calls.map((call) => call.params.model)).toEqual(["gpt-oss-120b", "gemini-3.5-flash"]);
    });

    it("falls back to plain JSON mode with the schema in the prompt when a schema is refused, and remembers it", async () => {
        const { completeJson } = await freshModule();
        fake.respond = (_baseURL, params) => {
            if (params.response_format.type === "json_schema") throw httpError(400, "Invalid JSON payload: unknown field additionalProperties");
            return { choices: [{ message: { content: "```json\n{\"ok\": true}\n```" }, finish_reason: "stop" }] };
        };
        const first = await completeJson<{ ok: boolean }>(request("generation"));
        expect(first.data).toEqual({ ok: true });
        expect(fake.calls.map((call) => call.params.response_format.type)).toEqual(["json_schema", "json_object"]);
        expect(fake.calls[1].params.messages[0].content).toContain("\"additionalProperties\":false");

        await completeJson(request("generation"));
        expect(fake.calls.map((call) => call.params.response_format.type)).toEqual(["json_schema", "json_object", "json_object"]);
    });

    it("reports Gemini's bad-key reply as a key problem, without a fallback attempt", async () => {
        const { completeJson } = await freshModule();
        fake.respond = () => { throw httpError(400, "API key not valid. Please pass a valid API key."); };
        await expect(completeJson(request("generation")))
            .rejects.toMatchObject({ code: "invalid_key", message: expect.stringContaining("GEMINI_API_KEY") });
        expect(fake.calls).toHaveLength(1);
    });

    it("lets the next Gemini model answer when one is busy or retired", async () => {
        const { completeJson } = await freshModule();
        fake.respond = (_baseURL, params) => {
            if (params.model === "gemini-3.6-flash") throw httpError(503, "The model is overloaded.");
            if (params.model === "gemini-3.5-flash") throw httpError(404, "404 status code (no body)");
            return reply({ ok: true });
        };
        const result = await completeJson(request("generation"));
        expect(result.model).toBe("gemini-3.8-flash");
        expect(fake.calls.map((call) => call.params.model)).toEqual(["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.8-flash"]);
    });

    it("says the service is busy when every model is, and keeps a chosen model on its own", async () => {
        const { completeJson } = await freshModule();
        vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
        fake.respond = () => { throw httpError(503, "The model is overloaded."); };
        await expect(completeJson(request("generation")))
            .rejects.toMatchObject({ code: "failed", message: expect.stringContaining("busy right now (error 503)") });
        expect(fake.calls).toHaveLength(1);
    });

    it("moves on to the next model when one is too slow, within the time budget", async () => {
        const { completeJson } = await freshModule();
        fake.respond = (_baseURL, params) => {
            if (params.model === "gemini-3.6-flash") throw new Error("Request timed out.");
            return reply({ ok: true });
        };
        const answered = await completeJson(request("generation", { timeoutMs: 20_000, budgetMs: 40_000 }));
        expect(answered.model).toBe("gemini-3.5-flash");

        fake.calls = [];
        const noTime = completeJson(request("generation", { timeoutMs: 20_000, budgetMs: 10_000 }));
        await expect(noTime).rejects.toMatchObject({ message: "Google Gemini took too long to answer. Try again." });
        expect(fake.calls).toHaveLength(1);
    });

    it("reports a used-up free limit as a wait", async () => {
        const { completeJson } = await freshModule();
        fake.respond = () => { throw httpError(429, "Resource has been exhausted"); };
        await expect(completeJson(request("verification"))).rejects.toMatchObject({ code: "rate_limited" });
    });

    it("rejects a reply that is not JSON", async () => {
        const { parseJsonReply } = await freshModule();
        expect(parseJsonReply("```\n{\"a\": 1}\n```")).toEqual({ a: 1 });
        expect(() => parseJsonReply("Sure! Here you go")).toThrow("valid JSON");
    });
});

describe("connection check", () => {
    it("names the service and key that failed when no other service can write", async () => {
        const { checkAiStatus } = await freshModule();
        fake.respond = (baseURL) => {
            if (baseURL === GEMINI) throw httpError(400, "API key not valid.");
            return reply({ ok: true });
        };
        const status = await checkAiStatus(true);
        expect(status).toMatchObject({ canGenerate: false, code: "invalid_key" });
        expect(status.message).toContain("Writing (Google Gemini)");
        expect(status.message).toContain("GEMINI_API_KEY");
    });

    it("reports the services that actually answered, and why one was passed over", async () => {
        const { checkAiStatus } = await freshModule();
        fake.respond = (baseURL) => {
            if (baseURL === CEREBRAS) throw httpError(402, "402 status code (no body)");
            return reply({ ok: true });
        };
        const status = await checkAiStatus(true);
        expect(status).toMatchObject({
            canGenerate: true,
            generationProvider: "Google Gemini", generationModel: "gemini-3.6-flash",
            verificationProvider: "Google Gemini", verificationModel: "gemini-3.5-flash",
        });
        expect(status.message).toContain("Answer checking uses Google Gemini because Cerebras");
    });

    it("is ready when both services answer, using a quick low-effort request", async () => {
        const { checkAiStatus } = await freshModule();
        const status = await checkAiStatus(true);
        expect(status).toMatchObject({ canGenerate: true, generationModel: "gemini-3.6-flash", verificationProvider: "Cerebras", verificationModel: "gpt-oss-120b" });
        expect(fake.calls.map((call) => call.baseURL)).toEqual([GEMINI, CEREBRAS]);
        expect(fake.calls.map((call) => call.params.reasoning_effort)).toEqual(["low", "low"]);
    });

    it("reports every preferred model of every service separately", async () => {
        const { checkModels } = await freshModule();
        fake.respond = (_baseURL, params) => {
            if (params.model === "gemini-3.8-flash") throw httpError(503, "The model is overloaded.");
            return reply({ ok: true });
        };
        const checks = await checkModels();
        expect(checks.map((check) => `${check.model}:${check.ok}`)).toEqual(["gemini-3.6-flash:true", "gemini-3.5-flash:true", "gemini-3.8-flash:false", "gpt-oss-120b:true"]);
        expect(checks[2].detail).toBe("HTTP 503: The model is overloaded.");
        expect(checks[0].detail).toBe("answered (strict JSON schema)");
    });

    it("explains a model the key cannot use", async () => {
        const { checkAiStatus } = await freshModule();
        vi.stubEnv("GEMINI_MODEL", "gemini-9-ultra");
        const status = await checkAiStatus(false);
        expect(status).toMatchObject({ canGenerate: false, code: "model_unavailable" });
        expect(status.message).toContain("GEMINI_MODEL");
    });
});

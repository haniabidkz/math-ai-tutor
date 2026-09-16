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

async function freshModule() {
    vi.resetModules();
    return import("@/lib/ai-studio/ai");
}

beforeEach(() => {
    fake.calls = [];
    fake.models = { [GEMINI]: ["models/gemini-2.5-flash", "models/gemini-3.8-flash"], [CEREBRAS]: ["gpt-oss-120b"] };
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
    it("writes with Gemini and checks with Cerebras when both keys exist", async () => {
        const { providerFor } = await freshModule();
        expect(providerFor("generation").id).toBe("gemini");
        expect(providerFor("verification").id).toBe("cerebras");
    });

    it("falls back to whichever key is set, and honours an explicit override", async () => {
        const { providerFor } = await freshModule();
        expect(providerFor("generation", { OPENAI_API_KEY: "x" }).id).toBe("openai");
        expect(providerFor("verification", { OPENAI_API_KEY: "x" }).id).toBe("openai");
        expect(providerFor("verification", { GEMINI_API_KEY: "x" }).id).toBe("gemini");
        expect(providerFor("verification", { CEREBRAS_API_KEY: "x", AI_VERIFICATION_PROVIDER: "Gemini" }).id).toBe("gemini");
    });

    it("plans smaller batches for Gemini, which always thinks first", async () => {
        const { questionBatchSize, checkBatchSize } = await freshModule();
        expect(questionBatchSize()).toBe(5);
        expect(checkBatchSize()).toBe(5);
        const steps = planSteps(DEFAULT_QUOTAS.micro, questionBatchSize());
        expect(steps.filter((step) => step.kind === "questions").map((step) => step.count)).toEqual([5, 5, 5, 5, 5, 5]);
    });
});

describe("JSON requests", () => {
    it("sends Gemini a strict schema with max_tokens, no temperature, and the newest listed model", async () => {
        const { completeJson } = await freshModule();
        const result = await completeJson<{ ok: boolean }>({ role: "generation", system: "s", user: "u", schemaName: "probe", schema, temperature: 0.6, maxOutputTokens: 48_000 });
        expect(result).toMatchObject({ data: { ok: true }, model: "gemini-3.8-flash", provider: "gemini" });
        const { baseURL, params } = fake.calls[0];
        expect(baseURL).toBe(GEMINI);
        expect(params.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true, schema } });
        expect(params.max_tokens).toBe(48_000);
        expect(params).not.toHaveProperty("max_completion_tokens");
        expect(params).not.toHaveProperty("temperature");
    });

    it("sends Cerebras max_completion_tokens within its free limit", async () => {
        const { completeJson } = await freshModule();
        await completeJson({ role: "verification", system: "s", user: "u", schemaName: "probe", schema, maxOutputTokens: 30_000 });
        expect(fake.calls[0].baseURL).toBe(CEREBRAS);
        expect(fake.calls[0].params.model).toBe("gpt-oss-120b");
        expect(fake.calls[0].params.max_completion_tokens).toBe(20_000);
    });

    it("falls back to plain JSON mode with the schema in the prompt when a schema is refused, and remembers it", async () => {
        const { completeJson } = await freshModule();
        fake.respond = (_baseURL, params) => {
            if (params.response_format.type === "json_schema") throw httpError(400, "Invalid JSON payload: unknown field additionalProperties");
            return { choices: [{ message: { content: "```json\n{\"ok\": true}\n```" }, finish_reason: "stop" }] };
        };
        const first = await completeJson<{ ok: boolean }>({ role: "generation", system: "rules", user: "u", schemaName: "probe", schema });
        expect(first.data).toEqual({ ok: true });
        expect(fake.calls.map((call) => call.params.response_format.type)).toEqual(["json_schema", "json_object"]);
        expect(fake.calls[1].params.messages[0].content).toContain("\"additionalProperties\":false");

        await completeJson({ role: "generation", system: "rules", user: "u", schemaName: "probe", schema });
        expect(fake.calls.map((call) => call.params.response_format.type)).toEqual(["json_schema", "json_object", "json_object"]);
    });

    it("reports Gemini's bad-key reply as a key problem, without a fallback attempt", async () => {
        const { completeJson } = await freshModule();
        fake.respond = () => { throw httpError(400, "API key not valid. Please pass a valid API key."); };
        await expect(completeJson({ role: "generation", system: "s", user: "u", schemaName: "probe", schema }))
            .rejects.toMatchObject({ code: "invalid_key", message: expect.stringContaining("GEMINI_API_KEY") });
        expect(fake.calls).toHaveLength(1);
    });

    it("reports a used-up free limit as a wait, not a failure", async () => {
        const { completeJson } = await freshModule();
        fake.respond = () => { throw httpError(429, "Resource has been exhausted"); };
        await expect(completeJson({ role: "verification", system: "s", user: "u", schemaName: "probe", schema }))
            .rejects.toMatchObject({ code: "rate_limited", message: expect.stringContaining("Cerebras") });
    });

    it("lets the next Gemini model answer when the first is busy", async () => {
        const { completeJson } = await freshModule();
        fake.respond = (_baseURL, params) => {
            if (params.model === "gemini-3.8-flash") throw httpError(503, "The model is overloaded.");
            return reply({ ok: true });
        };
        const result = await completeJson({ role: "generation", system: "s", user: "u", schemaName: "probe", schema });
        expect(result.model).toBe("gemini-2.5-flash");
        expect(fake.calls.map((call) => call.params.model)).toEqual(["gemini-3.8-flash", "gemini-2.5-flash"]);
    });

    it("says the service is busy when every model is, and keeps a chosen model on its own", async () => {
        const { completeJson } = await freshModule();
        vi.stubEnv("GEMINI_MODEL", "gemini-3.8-flash");
        fake.respond = () => { throw httpError(503, "The model is overloaded."); };
        await expect(completeJson({ role: "generation", system: "s", user: "u", schemaName: "probe", schema }))
            .rejects.toMatchObject({ code: "failed", message: expect.stringContaining("busy right now (error 503)") });
        expect(fake.calls).toHaveLength(1);
    });

    it("moves on to the next model when one is too slow, within the time budget", async () => {
        const { completeJson } = await freshModule();
        fake.respond = (_baseURL, params) => {
            if (params.model === "gemini-3.8-flash") throw new Error("Request timed out.");
            return reply({ ok: true });
        };
        const answered = await completeJson({ role: "generation", system: "s", user: "u", schemaName: "probe", schema, timeoutMs: 20_000, budgetMs: 40_000 });
        expect(answered.model).toBe("gemini-2.5-flash");

        fake.calls = [];
        const noTime = completeJson({ role: "generation", system: "s", user: "u", schemaName: "probe", schema, timeoutMs: 20_000, budgetMs: 10_000 });
        await expect(noTime).rejects.toMatchObject({ message: "Google Gemini took too long to answer. Try again." });
        expect(fake.calls).toHaveLength(1);
    });

    it("reports a request that timed out", async () => {
        const { completeJson } = await freshModule();
        fake.respond = () => { throw new Error("Request timed out."); };
        await expect(completeJson({ role: "verification", system: "s", user: "u", schemaName: "probe", schema, timeoutMs: 20_000 }))
            .rejects.toMatchObject({ code: "failed", message: "Cerebras took too long to answer. Try again." });
    });

    it("rejects a reply that is not JSON", async () => {
        const { parseJsonReply } = await freshModule();
        expect(parseJsonReply("```\n{\"a\": 1}\n```")).toEqual({ a: 1 });
        expect(() => parseJsonReply("Sure! Here you go")).toThrow("valid JSON");
    });
});

describe("connection check", () => {
    it("names the service and key that failed", async () => {
        const { checkAiStatus } = await freshModule();
        fake.respond = (baseURL) => {
            if (baseURL === CEREBRAS) throw httpError(401, "Wrong API Key");
            return reply({ ok: true });
        };
        const status = await checkAiStatus(true);
        expect(status).toMatchObject({ canGenerate: false, code: "invalid_key", generationProvider: "Google Gemini", verificationProvider: "Cerebras", generationModel: "gemini-3.8-flash" });
        expect(status.message).toContain("Answer checking (Cerebras)");
        expect(status.message).toContain("CEREBRAS_API_KEY");
    });

    it("is ready when both services answer", async () => {
        const { checkAiStatus } = await freshModule();
        const status = await checkAiStatus(true);
        expect(status).toMatchObject({ canGenerate: true, generationModel: "gemini-3.8-flash", verificationModel: "gpt-oss-120b" });
        expect(fake.calls.map((call) => call.baseURL)).toEqual([GEMINI, CEREBRAS]);
        // The quick test asks for little thinking so it answers fast.
        expect(fake.calls.map((call) => call.params.reasoning_effort)).toEqual(["low", "low"]);
    });

    it("reports every preferred model of both services separately", async () => {
        const { checkModels } = await freshModule();
        fake.respond = (_baseURL, params) => {
            if (params.model === "gemini-3.8-flash") throw httpError(503, "The model is overloaded.");
            return reply({ ok: true });
        };
        const checks = await checkModels();
        expect(checks.map((check) => `${check.model}:${check.ok}`)).toEqual(["gemini-3.8-flash:false", "gemini-2.5-flash:true", "gpt-oss-120b:true"]);
        expect(checks[0].detail).toBe("HTTP 503: The model is overloaded.");
        expect(checks[1].detail).toBe("answered (strict JSON schema)");
    });

    it("explains a model the key cannot use", async () => {
        const { checkAiStatus } = await freshModule();
        vi.stubEnv("GEMINI_MODEL", "gemini-9-ultra");
        const status = await checkAiStatus(false);
        expect(status).toMatchObject({ canGenerate: false, code: "model_unavailable" });
        expect(status.message).toContain("GEMINI_MODEL");
    });
});

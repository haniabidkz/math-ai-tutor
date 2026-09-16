import OpenAI from "openai";

/**
 * Server-only AI access for the AI Studio. One service writes the content and another checks
 * every answer, each reached through its OpenAI-compatible endpoint. Nothing here may be
 * imported by client code: it reads API keys, which must never reach the browser.
 */

export type AiErrorCode = "not_configured" | "invalid_key" | "no_credit" | "rate_limited" | "model_unavailable" | "refused" | "bad_output" | "failed";

export class AiError extends Error {
    constructor(public code: AiErrorCode, message: string) {
        super(message);
        this.name = "AiError";
    }
}

export type AiRole = "generation" | "verification";
export type ProviderId = "gemini" | "cerebras" | "openai";

export interface AiProvider {
    id: ProviderId;
    label: string;
    keyEnv: string;
    baseURL?: string;
    /** Optional model overrides per role. */
    modelEnv: Record<AiRole, string>;
    /** Preferred models, best first. */
    models: Record<AiRole, string[]>;
    /** Largest reply to ask for, thinking included. */
    maxOutputTokens: number;
    /** Questions per generation step, and per answer-check request. */
    questionBatch: number;
    checkBatch: number;
    tokenParam: "max_tokens" | "max_completion_tokens";
}

export const PROVIDERS: Record<ProviderId, AiProvider> = {
    gemini: {
        id: "gemini",
        label: "Google Gemini",
        keyEnv: "GEMINI_API_KEY",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
        modelEnv: { generation: "GEMINI_MODEL", verification: "GEMINI_VERIFY_MODEL" },
        models: {
            generation: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"],
            verification: ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"],
        },
        maxOutputTokens: 60_000,
        // Gemini always thinks first; five questions a step stays well inside the time limit.
        questionBatch: 5,
        checkBatch: 10,
        tokenParam: "max_tokens",
    },
    cerebras: {
        id: "cerebras",
        label: "Cerebras",
        keyEnv: "CEREBRAS_API_KEY",
        baseURL: "https://api.cerebras.ai/v1",
        modelEnv: { generation: "CEREBRAS_MODEL", verification: "CEREBRAS_VERIFY_MODEL" },
        models: {
            generation: ["gpt-oss-120b", "qwen-3.8-27b"],
            verification: ["gpt-oss-120b", "qwen-3.8-27b"],
        },
        // The free tier allows 32k output tokens per request.
        maxOutputTokens: 20_000,
        questionBatch: 5,
        checkBatch: 5,
        tokenParam: "max_completion_tokens",
    },
    openai: {
        id: "openai",
        label: "OpenAI",
        keyEnv: "OPENAI_API_KEY",
        modelEnv: { generation: "OPENAI_MODEL", verification: "OPENAI_VERIFY_MODEL" },
        models: {
            generation: ["gpt-4.1", "gpt-4o"],
            verification: ["o4-mini", "o3-mini", "gpt-4.1", "gpt-4o"],
        },
        maxOutputTokens: 30_000,
        questionBatch: 10,
        checkBatch: 10,
        tokenParam: "max_completion_tokens",
    },
};

/** Writing prefers Gemini and checking prefers Cerebras, so two different model families see every answer. */
const PREFERENCE: Record<AiRole, ProviderId[]> = {
    generation: ["gemini", "openai", "cerebras"],
    verification: ["cerebras", "openai", "gemini"],
};

const OVERRIDE_ENV: Record<AiRole, string> = {
    generation: "AI_GENERATION_PROVIDER",
    verification: "AI_VERIFICATION_PROVIDER",
};

type Env = Record<string, string | undefined>;

/** The service for a role: an explicit override, else the first preferred one with a key. */
export function providerFor(role: AiRole, env: Env = process.env): AiProvider {
    const override = env[OVERRIDE_ENV[role]]?.trim().toLowerCase() as ProviderId | undefined;
    if (override && PROVIDERS[override]) return PROVIDERS[override];
    const configured = PREFERENCE[role].find((id) => env[PROVIDERS[id].keyEnv]?.trim());
    return PROVIDERS[configured ?? PREFERENCE[role][0]];
}

export const questionBatchSize = () => providerFor("generation").questionBatch;
export const checkBatchSize = () => providerFor("verification").checkBatch;

function keyFor(provider: AiProvider): string {
    const key = process.env[provider.keyEnv]?.trim();
    if (!key) throw new AiError("not_configured", `${provider.keyEnv} is not set on the server.`);
    return key;
}

// No silent SDK retries: each Studio request must finish inside the 300-second function limit,
// and the browser retries a failed step itself.
const clientFor = (provider: AiProvider) =>
    new OpenAI({ apiKey: keyFor(provider), baseURL: provider.baseURL, timeout: 250_000, maxRetries: 0 });

/** Reasoning models reject temperature. */
export function isReasoningModel(model: string): boolean {
    return /^(o\d|gpt-5)/.test(model);
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error ?? ""));
const errorStatus = (error: unknown) => (error as { status?: number })?.status;
/** Gemini answers a bad key with HTTP 400 rather than 401. */
const isKeyProblem = (error: unknown) => errorStatus(error) === 400 && /api[ _-]?key/i.test(errorMessage(error));

export function mapAiError(error: unknown, provider: AiProvider): AiError {
    if (error instanceof AiError) return error;
    const status = errorStatus(error);
    const code = String((error as { code?: string })?.code ?? (error as { error?: { code?: string } })?.error?.code ?? "");
    const message = errorMessage(error) || "request failed";
    const who = provider.label;
    if (status === 401 || status === 403 || isKeyProblem(error)) {
        return new AiError("invalid_key", `${who} rejected the API key in ${provider.keyEnv}. It may be mistyped, revoked or not enabled.`);
    }
    if (code === "insufficient_quota") return new AiError("no_credit", `The ${who} account has no credit left.`);
    if (status === 429) {
        return new AiError("rate_limited", `The free ${who} limit was reached. Wait a minute and try again; if it keeps happening, today's free limit is used up.`);
    }
    if (status === 404 || code === "model_not_found") return new AiError("model_unavailable", `${who} cannot use the selected model. ${message}`);
    if ((error as { name?: string })?.name === "APIConnectionTimeoutError") return new AiError("failed", `${who} took too long to answer. Try again.`);
    return new AiError("failed", `${who}: ${message}`);
}

const modelCache = new Map<ProviderId, { ids: string[]; at: number }>();

async function listModelIds(provider: AiProvider): Promise<string[]> {
    const cached = modelCache.get(provider.id);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.ids;
    const ids: string[] = [];
    try {
        // Gemini lists ids as "models/gemini-...", which requests do not use.
        for await (const model of clientFor(provider).models.list()) ids.push(model.id.replace(/^models\//, ""));
    } catch (error) {
        // A service without a model list still works with the preferred model.
        if (errorStatus(error) !== 404) throw mapAiError(error, provider);
    }
    modelCache.set(provider.id, { ids, at: Date.now() });
    return ids;
}

export async function modelFor(role: AiRole): Promise<{ provider: AiProvider; model: string; available: string[] }> {
    const provider = providerFor(role);
    const available = await listModelIds(provider);
    const override = process.env[provider.modelEnv[role]]?.trim();
    const preferred = provider.models[role];
    const model = override || preferred.find((id) => available.includes(id)) || preferred[0];
    return { provider, model, available };
}

export interface JsonCompletion<T> {
    data: T;
    usage: { inputTokens: number; outputTokens: number };
    model: string;
    provider: ProviderId;
}

/** Models that rejected strict JSON Schema; they get plain JSON mode and the schema in the prompt. */
const plainJsonOnly = new Set<string>();

/** Parses a reply, tolerating a Markdown code fence around the JSON. */
export function parseJsonReply<T>(content: string): T {
    const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
        return JSON.parse(trimmed) as T;
    } catch {
        throw new AiError("bad_output", "The model did not return valid JSON.");
    }
}

/**
 * One JSON chat completion for a role. Strict schema mode is tried first; a service that
 * rejects the schema gets plain JSON mode instead, and the Studio's own checks still apply.
 */
export async function completeJson<T>(input: {
    role: AiRole;
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    temperature?: number;
    maxOutputTokens?: number;
}): Promise<JsonCompletion<T>> {
    const { provider, model } = await modelFor(input.role);
    const client = clientFor(provider);
    const limit = Math.min(input.maxOutputTokens ?? 16_000, provider.maxOutputTokens);
    const cacheKey = `${provider.id}:${model}`;

    const send = (strict: boolean) => {
        const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
            model,
            messages: [
                {
                    role: "system",
                    content: strict
                        ? input.system
                        : `${input.system}\n\nReply with one JSON object only, matching this JSON Schema exactly:\n${JSON.stringify(input.schema)}`,
                },
                { role: "user", content: input.user },
            ],
            response_format: strict
                ? { type: "json_schema", json_schema: { name: input.schemaName, strict: true, schema: input.schema } }
                : { type: "json_object" },
        };
        if (provider.tokenParam === "max_tokens") params.max_tokens = limit;
        else params.max_completion_tokens = limit;
        // Only OpenAI's non-reasoning models take a custom temperature; the others work best at their default.
        if (provider.id === "openai" && !isReasoningModel(model) && input.temperature !== undefined) params.temperature = input.temperature;
        return client.chat.completions.create(params);
    };

    let response: OpenAI.Chat.ChatCompletion;
    try {
        if (plainJsonOnly.has(cacheKey)) {
            response = await send(false);
        } else {
            try {
                response = await send(true);
            } catch (error) {
                if (errorStatus(error) !== 400 || isKeyProblem(error)) throw error;
                response = await send(false);
                plainJsonOnly.add(cacheKey);
            }
        }
    } catch (error) {
        throw mapAiError(error, provider);
    }

    const choice = response.choices[0];
    if (choice?.message?.refusal) throw new AiError("refused", `The model refused: ${choice.message.refusal}`);
    if (choice?.finish_reason === "length") throw new AiError("bad_output", "The reply was cut off before it finished.");
    return {
        data: parseJsonReply<T>(choice?.message?.content ?? ""),
        usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
        model,
        provider: provider.id,
    };
}

export interface AiStatus {
    configured: boolean;
    valid: boolean;
    canGenerate: boolean;
    generationProvider: string | null;
    verificationProvider: string | null;
    generationModel: string | null;
    verificationModel: string | null;
    message: string;
    code?: AiErrorCode;
}

const ROLE_NAMES: Record<AiRole, string> = { generation: "Writing", verification: "Answer checking" };

/**
 * Checks both services: the key, the chosen model and, when asked, that each can actually
 * answer (a valid key can still fail on a real request, for example with no quota).
 */
export async function checkAiStatus(probe = false): Promise<AiStatus> {
    const status: AiStatus = {
        configured: true, valid: true, canGenerate: true,
        generationProvider: providerFor("generation").label,
        verificationProvider: providerFor("verification").label,
        generationModel: null, verificationModel: null,
        message: "",
    };

    for (const role of ["generation", "verification"] as const) {
        const provider = providerFor(role);
        try {
            const { model, available } = await modelFor(role);
            if (role === "generation") status.generationModel = model;
            else status.verificationModel = model;
            if (available.length && !available.includes(model)) {
                const options = available.filter((id) => /^(gpt|o\d|gemini|qwen|llama)/.test(id)).slice(0, 8).join(", ");
                throw new AiError("model_unavailable", `The key works, but it cannot use ${model}. Set ${provider.modelEnv[role]} to one of: ${options}.`);
            }
            if (probe) {
                await completeJson<{ ok: boolean }>({
                    role,
                    system: "Reply with the JSON object requested.",
                    user: "Return ok as true.",
                    schemaName: "probe",
                    schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
                    maxOutputTokens: 2_000,
                });
            }
        } catch (error) {
            const failure = mapAiError(error, provider);
            return {
                ...status,
                configured: failure.code !== "not_configured",
                valid: !["not_configured", "invalid_key"].includes(failure.code),
                canGenerate: false,
                code: failure.code,
                message: `${ROLE_NAMES[role]} (${provider.label}): ${failure.message}`,
            };
        }
    }
    status.message = probe ? "Connected. A test request to each service succeeded." : "Connected.";
    return status;
}

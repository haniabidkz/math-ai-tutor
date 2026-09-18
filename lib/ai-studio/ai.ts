import OpenAI from "openai";

/**
 * Server-only AI access for the AI Studio. One service writes the content and another checks
 * every answer, each reached through its OpenAI-compatible endpoint. Nothing here may be
 * imported by client code: it reads API keys, which must never reach the browser.
 */

/** "busy" and "rate_limited" mean wait and try again; the Studio does that on its own. */
export type AiErrorCode = "not_configured" | "invalid_key" | "no_credit" | "rate_limited" | "busy" | "model_unavailable" | "refused" | "bad_output" | "failed";

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
        // Ordered by how reliably each answered on the free tier (September 2026); the newest
        // Flash models were overloaded. Checking starts with a different model from writing.
        models: {
            generation: ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-3.8-flash"],
            verification: ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-3.8-flash"],
        },
        maxOutputTokens: 60_000,
        // The free tier allows few requests a day, so each request carries ten questions;
        // 3.6 Flash wrote five in 22-42 seconds, well inside the 150-second wait per model.
        questionBatch: 10,
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
        // September 2026: GPT-5.6 Luna, OpenAI's current cost-optimised model ($0.20/$1.20 per 1M
        // tokens), writes; GPT-5 mini ($0.25/$2.00) re-solves, so a different model checks every
        // answer. Backups stay close in price. o3-mini and o4-mini shut down on 23 October 2026.
        models: {
            generation: ["gpt-5.6-luna", "gpt-5-mini", "gpt-5.4-mini"],
            verification: ["gpt-5-mini", "gpt-5.6-luna", "gpt-5.4-mini"],
        },
        maxOutputTokens: 30_000,
        // Writing at high reasoning effort took up to 27 seconds a hard question, so three a request
        // stays well inside the 150-second wait per model. Checks took 11-23 seconds for five.
        // OpenAI's rate limits make the extra requests harmless.
        questionBatch: 3,
        checkBatch: 5,
        tokenParam: "max_completion_tokens",
    },
};

/**
 * OpenAI only by default: the owner chose it in September 2026. Gemini and Cerebras stay
 * available by listing services in order in AI_GENERATION_PROVIDER / AI_VERIFICATION_PROVIDER,
 * for example "openai,gemini"; a listed service whose account cannot be used hands over to the next.
 */
const DEFAULT_PROVIDERS: Record<AiRole, ProviderId[]> = {
    generation: ["openai"],
    verification: ["openai"],
};

const OVERRIDE_ENV: Record<AiRole, string> = {
    generation: "AI_GENERATION_PROVIDER",
    verification: "AI_VERIFICATION_PROVIDER",
};

type Env = Record<string, string | undefined>;

const isProviderId = (value: string): value is ProviderId => Object.hasOwn(PROVIDERS, value);

/**
 * Services to try for a role, in order: the listed (or default) services that have a key. With
 * none, the first one is returned so its missing key is what gets reported.
 */
export function providersFor(role: AiRole, env: Env = process.env): AiProvider[] {
    const listed = [...new Set((env[OVERRIDE_ENV[role]] ?? "").split(",").map((id) => id.trim().toLowerCase()).filter(isProviderId))];
    const order = listed.length ? listed : DEFAULT_PROVIDERS[role];
    const configured = order.filter((id) => env[PROVIDERS[id].keyEnv]?.trim()).map((id) => PROVIDERS[id]);
    return configured.length ? configured : [PROVIDERS[order[0]]];
}

export const providerFor = (role: AiRole, env: Env = process.env) => providersFor(role, env)[0];
export const questionBatchSize = () => providerFor("generation").questionBatch;
export const checkBatchSize = () => Math.min(...providersFor("verification").map((provider) => provider.checkBatch));

function keyFor(provider: AiProvider): string {
    const key = process.env[provider.keyEnv]?.trim();
    if (!key) throw new AiError("not_configured", `${provider.keyEnv} is not set on the server.`);
    return key;
}

// No silent SDK retries: each Studio request must finish inside the 300-second function limit,
// and the browser retries a failed step itself.
const clientFor = (provider: AiProvider, timeoutMs = 250_000) =>
    new OpenAI({ apiKey: keyFor(provider), baseURL: provider.baseURL, timeout: timeoutMs, maxRetries: 0 });

/** Reasoning models (o-series, GPT-5 and later) reject temperature. */
export function isReasoningModel(model: string): boolean {
    return /^(o\d|gpt-[5-9])/.test(model);
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error ?? ""));
const errorStatus = (error: unknown) => (error as { status?: number })?.status;
/** Gemini answers a bad key with HTTP 400 rather than 401. */
const isKeyProblem = (error: unknown) => errorStatus(error) === 400 && /api[ _-]?key/i.test(errorMessage(error));
const isTimeout = (error: unknown) => !errorStatus(error) && /timed? ?out/i.test(errorMessage(error));
/** A busy, slow, retired or rate-limited model; another model of the same service may still answer. */
const isModelProblem = (error: unknown) => isTimeout(error) || [404, 429, 500, 502, 503, 504].includes(errorStatus(error) ?? 0);
/** The whole service is unusable for this account; the next service should take over. */
const isAccountProblem = (error: AiError) => ["not_configured", "invalid_key", "no_credit"].includes(error.code);

export function mapAiError(error: unknown, provider: AiProvider): AiError {
    if (error instanceof AiError) return error;
    const status = errorStatus(error);
    const code = String((error as { code?: string })?.code ?? (error as { error?: { code?: string } })?.error?.code ?? "");
    const message = errorMessage(error) || "request failed";
    const who = provider.label;
    if (status === 401 || status === 403 || isKeyProblem(error)) {
        return new AiError("invalid_key", `${who} rejected the API key in ${provider.keyEnv}. It may be mistyped, revoked or not enabled.`);
    }
    if (status === 402 || code === "insufficient_quota") {
        return new AiError("no_credit", `The ${who} account needs billing or credits before its API can be used (HTTP ${status ?? 429}).`);
    }
    if (status === 429) {
        return new AiError("rate_limited", `The free ${who} limit was reached. Wait a minute and try again; if it keeps happening, today's free limit is used up.`);
    }
    if (status === 404 || code === "model_not_found") return new AiError("model_unavailable", `${who} cannot use the selected model. ${message}`);
    if (isTimeout(error)) return new AiError("busy", `${who} took too long to answer. Try again.`);
    if (status && status >= 500) return new AiError("busy", `${who} is busy right now (error ${status}). Try again in a minute.`);
    return new AiError("failed", `${who}: ${message}`);
}

const modelCache = new Map<ProviderId, { ids: string[]; at: number }>();

async function listModelIds(provider: AiProvider): Promise<string[]> {
    const cached = modelCache.get(provider.id);
    if (cached && Date.now() - cached.at < 10 * 60_000) return cached.ids;
    const ids: string[] = [];
    try {
        // Gemini lists ids as "models/gemini-...", which requests do not use.
        for await (const model of clientFor(provider, 10_000).models.list()) ids.push(model.id.replace(/^models\//, ""));
    } catch (error) {
        // A service without a model list still works with the preferred model.
        if (errorStatus(error) !== 404) throw mapAiError(error, provider);
    }
    modelCache.set(provider.id, { ids, at: Date.now() });
    return ids;
}

export async function modelFor(role: AiRole, provider = providerFor(role)): Promise<{ provider: AiProvider; model: string; backups: string[]; available: string[] }> {
    const available = await listModelIds(provider);
    const override = process.env[provider.modelEnv[role]]?.trim();
    const listed = provider.models[role].filter((id) => !available.length || available.includes(id));
    const model = override || listed[0] || provider.models[role][0];
    // A chosen override is used alone; otherwise the next listed model stands in when the first fails.
    return { provider, model, backups: override ? [] : listed.filter((id) => id !== model), available };
}

/** A service passed over because its account could not be used. */
export interface SkippedService {
    provider: string;
    code: AiErrorCode;
    message: string;
}

export interface JsonCompletion<T> {
    data: T;
    usage: { inputTokens: number; outputTokens: number };
    model: string;
    provider: ProviderId;
    /** Services passed over because their account could not be used. */
    skipped: SkippedService[];
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

export interface JsonRequest {
    role: AiRole;
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    temperature?: number;
    maxOutputTokens?: number;
    /** Longest wait for one model. */
    timeoutMs?: number;
    /** Longest wait overall, backups included; must fit the function's time limit. */
    budgetMs?: number;
    reasoningEffort?: "low" | "medium" | "high";
}

/** Below this, a backup model would not have time to answer. */
const MIN_ATTEMPT_MS = 30_000;
/** Each free model has its own daily quota, so every listed model may stand in. */
const BACKUP_MODELS = 3;

/**
 * One JSON chat completion for a role. Strict schema mode is tried first; a service that
 * rejects the schema gets plain JSON mode instead, and the Studio's own checks still apply.
 * A busy, slow or rate-limited model hands over to the service's next model, and a service
 * whose account cannot be used hands over to the next service, while the time budget allows.
 */
export async function completeJson<T>(input: JsonRequest): Promise<JsonCompletion<T>> {
    const started = Date.now();
    const budget = input.budgetMs ?? 270_000;
    const minimum = Math.min(MIN_ATTEMPT_MS, input.timeoutMs ?? MIN_ATTEMPT_MS);
    const skipped: SkippedService[] = [];
    const providers = providersFor(input.role);
    const tried: string[] = [];
    // A model that was busy, slow or rate-limited explains the failure better than a service
    // skipped for its account, and its "wait and retry" code keeps the Studio going.
    let modelError: AiError | null = null;
    let accountError: AiError | null = null;
    const giveUp = () => {
        if (!modelError) return accountError ?? new AiError("busy", `${providers[0].label} did not answer in time. Try again.`);
        return tried.length > 1 && ["busy", "rate_limited"].includes(modelError.code)
            ? new AiError(modelError.code, `${modelError.message} (tried ${tried.join(", ")})`)
            : modelError;
    };
    const skip = (provider: AiProvider, error: AiError) => {
        accountError = error;
        skipped.push({ provider: provider.label, code: error.code, message: error.message });
    };

    for (const provider of providers) {
        let models: string[];
        try {
            const chosen = await modelFor(input.role, provider);
            models = [chosen.model, ...chosen.backups.slice(0, BACKUP_MODELS)];
        } catch (error) {
            const failure = mapAiError(error, provider);
            if (!isAccountProblem(failure)) throw failure;
            skip(provider, failure);
            continue;
        }
        for (const model of models) {
            const remaining = budget - (Date.now() - started);
            if (tried.length > 0 && remaining < minimum) throw giveUp();
            tried.push(model);
            try {
                const result = await completeWithModel<T>(input, provider, model, Math.max(5_000, Math.min(input.timeoutMs ?? 250_000, remaining)));
                return { ...result, skipped };
            } catch (error) {
                const failure = mapAiError(error, provider);
                if (isAccountProblem(failure)) {
                    skip(provider, failure);
                    break;
                }
                if (!isModelProblem(error)) throw failure;
                modelError = failure;
            }
        }
    }
    throw giveUp();
}

async function completeWithModel<T>(input: JsonRequest, provider: AiProvider, model: string, timeoutMs: number): Promise<Omit<JsonCompletion<T>, "skipped">> {
    const client = clientFor(provider, timeoutMs);
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
        if (input.reasoningEffort && (provider.id !== "openai" || isReasoningModel(model))) params.reasoning_effort = input.reasoningEffort;
        return client.chat.completions.create(params);
    };

    let response: OpenAI.Chat.ChatCompletion;
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

/** Short reasons for the connection check; the full messages stay in the server errors. */
const SKIP_REASONS: Partial<Record<AiErrorCode, string>> = {
    no_credit: "needs billing",
    invalid_key: "key is not accepted",
    not_configured: "has no key",
};

/** A tiny request; short limits so a slow service is named instead of the whole check timing out. */
const probeRequest = (role: AiRole): JsonRequest => ({
    role,
    system: "Reply with the JSON object requested.",
    user: "Return ok as true.",
    schemaName: "probe",
    schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
    maxOutputTokens: 2_000,
    timeoutMs: 20_000,
    budgetMs: 40_000,
    reasoningEffort: "low",
});

/**
 * Checks both roles. Without a probe it only reads the first service's model list; with a
 * probe it sends each role a tiny request and reports the service and model that answered.
 */
export async function checkAiStatus(probe = false): Promise<AiStatus> {
    const status: AiStatus = {
        configured: true, valid: true, canGenerate: true,
        generationProvider: providerFor("generation").label,
        verificationProvider: providerFor("verification").label,
        generationModel: null, verificationModel: null,
        message: "",
    };
    const notes: string[] = [];

    for (const role of ["generation", "verification"] as const) {
        const provider = providerFor(role);
        try {
            let label = provider.label;
            let model: string;
            if (probe) {
                const answered = await completeJson<{ ok: boolean }>(probeRequest(role));
                label = PROVIDERS[answered.provider].label;
                model = answered.model;
                if (answered.skipped.length) {
                    const reasons = answered.skipped.map((service) => `${service.provider} ${SKIP_REASONS[service.code] ?? "cannot be used"}`);
                    notes.push(`${ROLE_NAMES[role]} uses ${label} (${reasons.join("; ")}).`);
                }
            } else {
                const chosen = await modelFor(role);
                model = chosen.model;
                if (chosen.available.length && !chosen.available.includes(model)) {
                    const options = chosen.available.filter((id) => /^(gpt|o\d|gemini|qwen|llama)/.test(id)).slice(0, 8).join(", ");
                    throw new AiError("model_unavailable", `The key works, but it cannot use ${model}. Set ${provider.modelEnv[role]} to one of: ${options}.`);
                }
            }
            if (role === "generation") {
                status.generationProvider = label;
                status.generationModel = model;
            } else {
                status.verificationProvider = label;
                status.verificationModel = model;
            }
        } catch (error) {
            const failure = mapAiError(error, provider);
            return {
                ...status,
                configured: failure.code !== "not_configured",
                valid: !["not_configured", "invalid_key"].includes(failure.code),
                // Busy and rate limits pass; the Studio waits and retries on its own.
                canGenerate: failure.code === "busy" || failure.code === "rate_limited",
                code: failure.code,
                message: `${ROLE_NAMES[role]} (${provider.label}): ${failure.message}`,
            };
        }
    }
    status.message = [probe ? "Connected. A test request for writing and for answer checking succeeded." : "Connected.", ...notes].join(" ");
    return status;
}

export interface ModelCheck {
    provider: string;
    model: string;
    ok: boolean;
    seconds: number;
    detail: string;
}

/** Tries every preferred model of every configured service at once, to see which answer and how fast. */
export async function checkModels(): Promise<ModelCheck[]> {
    const providers = [...new Set([...providersFor("generation"), ...providersFor("verification")])];
    const perProvider = await Promise.all(providers.map(async (provider) => {
        let available: string[];
        try {
            available = await listModelIds(provider);
        } catch (error) {
            return [{ provider: provider.label, model: "(model list)", ok: false, seconds: 0, detail: mapAiError(error, provider).message }];
        }
        const models = [...new Set([...provider.models.generation, ...provider.models.verification])]
            .filter((id) => !available.length || available.includes(id));
        return Promise.all(models.map(async (model): Promise<ModelCheck> => {
            const started = Date.now();
            const seconds = () => Math.round((Date.now() - started) / 100) / 10;
            try {
                await completeWithModel(probeRequest("generation"), provider, model, 25_000);
                const mode = plainJsonOnly.has(`${provider.id}:${model}`) ? "plain JSON mode" : "strict JSON schema";
                return { provider: provider.label, model, ok: true, seconds: seconds(), detail: `answered (${mode})` };
            } catch (error) {
                const status = errorStatus(error);
                return { provider: provider.label, model, ok: false, seconds: seconds(), detail: `${status ? `HTTP ${status}: ` : ""}${errorMessage(error).slice(0, 200)}` };
            }
        }));
    }));
    return perProvider.flat();
}

import OpenAI from "openai";

/**
 * Server-only access to OpenAI for the AI Studio. Nothing here may be imported by client code:
 * it reads OPENAI_API_KEY, which must never reach the browser.
 */

export type AiErrorCode = "not_configured" | "invalid_key" | "no_credit" | "rate_limited" | "model_unavailable" | "refused" | "bad_output" | "failed";

export class AiError extends Error {
    constructor(public code: AiErrorCode, message: string) {
        super(message);
        this.name = "AiError";
    }
}

/** Preferred models, best first. Overridable with OPENAI_MODEL / OPENAI_VERIFY_MODEL. */
const GENERATION_PREFERENCE = ["gpt-4.1", "gpt-4o"];
const VERIFICATION_PREFERENCE = ["o4-mini", "o3-mini", "gpt-4.1", "gpt-4o"];

let cachedModelIds: { ids: string[]; at: number } | null = null;

function apiKey(): string {
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new AiError("not_configured", "OPENAI_API_KEY is not set on the server.");
    return key;
}

/** Reasoning models reject temperature and count output with max_completion_tokens. */
export function isReasoningModel(model: string): boolean {
    return /^(o\d|gpt-5)/.test(model);
}

async function listModelIds(): Promise<string[]> {
    if (cachedModelIds && Date.now() - cachedModelIds.at < 10 * 60_000) return cachedModelIds.ids;
    const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${apiKey()}` } });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) throw new AiError("invalid_key", "OpenAI rejected the API key. It may be revoked or mistyped.");
    if (!response.ok) throw new AiError("failed", `OpenAI returned ${response.status} while listing models.`);
    const ids = (body.data ?? []).map((model: { id: string }) => model.id) as string[];
    cachedModelIds = { ids, at: Date.now() };
    return ids;
}

export async function resolveModels(): Promise<{ generation: string; verification: string; available: string[] }> {
    const available = await listModelIds();
    const pick = (override: string | undefined, preference: string[]) => {
        const chosen = override?.trim();
        if (chosen) return chosen;
        return preference.find((model) => available.includes(model)) ?? preference[preference.length - 1];
    };
    return {
        generation: pick(process.env.OPENAI_MODEL, GENERATION_PREFERENCE),
        verification: pick(process.env.OPENAI_VERIFY_MODEL, VERIFICATION_PREFERENCE),
        available,
    };
}

function mapOpenAiError(error: unknown): AiError {
    if (error instanceof AiError) return error;
    const status = (error as { status?: number }).status;
    const code = String((error as { code?: string }).code ?? (error as { error?: { code?: string } }).error?.code ?? "");
    const message = error instanceof Error ? error.message : "OpenAI request failed";
    if (status === 401) return new AiError("invalid_key", "OpenAI rejected the API key. It may be revoked or mistyped.");
    if (code === "insufficient_quota") return new AiError("no_credit", "The OpenAI account has no credit left. Add billing on platform.openai.com.");
    if (status === 429) return new AiError("rate_limited", "OpenAI is rate limiting requests. Wait a minute and retry.");
    if (status === 404 || code === "model_not_found") return new AiError("model_unavailable", `This OpenAI key cannot use the selected model. ${message}`);
    return new AiError("failed", message);
}

export interface JsonCompletion<T> {
    data: T;
    usage: { inputTokens: number; outputTokens: number };
    model: string;
}

/** One strict-JSON chat completion; the reply is guaranteed to match the schema or it throws. */
export async function completeJson<T>(input: {
    model: string;
    system: string;
    user: string;
    schemaName: string;
    schema: Record<string, unknown>;
    temperature?: number;
    maxOutputTokens?: number;
}): Promise<JsonCompletion<T>> {
    const client = new OpenAI({ apiKey: apiKey() });
    try {
        const response = await client.chat.completions.create({
            model: input.model,
            messages: [
                { role: "system", content: input.system },
                { role: "user", content: input.user },
            ],
            response_format: { type: "json_schema", json_schema: { name: input.schemaName, strict: true, schema: input.schema } },
            max_completion_tokens: input.maxOutputTokens ?? 16_000,
            ...(isReasoningModel(input.model) || input.temperature === undefined ? {} : { temperature: input.temperature }),
        });
        const choice = response.choices[0];
        if (choice?.message?.refusal) throw new AiError("refused", `The model refused: ${choice.message.refusal}`);
        if (choice?.finish_reason === "length") throw new AiError("bad_output", "The reply was cut off before it finished.");
        const content = choice?.message?.content ?? "";
        let data: T;
        try {
            data = JSON.parse(content) as T;
        } catch {
            throw new AiError("bad_output", "The model did not return valid JSON.");
        }
        return {
            data,
            usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
            model: response.model,
        };
    } catch (error) {
        throw mapOpenAiError(error);
    }
}

export interface AiStatus {
    configured: boolean;
    valid: boolean;
    canGenerate: boolean;
    generationModel: string | null;
    verificationModel: string | null;
    message: string;
    code?: AiErrorCode;
}

/**
 * Checks the key, the chosen models and, when asked, that the account can actually
 * answer (a valid key with no credit only fails on a real request).
 */
export async function checkAiStatus(probe = false): Promise<AiStatus> {
    try {
        const models = await resolveModels();
        const missing = [models.generation, models.verification].filter((model) => !models.available.includes(model));
        if (missing.length) {
            return {
                configured: true, valid: true, canGenerate: false,
                generationModel: models.generation, verificationModel: models.verification,
                code: "model_unavailable",
                message: `The key works, but it cannot use ${missing.join(" and ")}. Set OPENAI_MODEL to one of: ${models.available.filter((id) => /^(gpt|o\d)/.test(id)).slice(0, 8).join(", ")}.`,
            };
        }
        if (probe) {
            await completeJson<{ ok: boolean }>({
                model: models.generation,
                system: "Reply with the JSON object requested.",
                user: "Return ok as true.",
                schemaName: "probe",
                schema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } },
                maxOutputTokens: 500,
            });
        }
        return {
            configured: true, valid: true, canGenerate: true,
            generationModel: models.generation, verificationModel: models.verification,
            message: probe ? "Connected. A test request succeeded." : "Connected.",
        };
    } catch (error) {
        const failure = mapOpenAiError(error);
        return {
            configured: failure.code !== "not_configured",
            valid: !["not_configured", "invalid_key"].includes(failure.code),
            canGenerate: false,
            generationModel: null,
            verificationModel: null,
            code: failure.code,
            message: failure.message,
        };
    }
}

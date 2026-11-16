import { z } from "zod";
import type { LessonVisual, LessonVisualSpec, LessonVisualType, LocalizedText, WorkedExample } from "@/types/curriculum";

/**
 * Lesson visuals and worked examples written by AI Studio.
 *
 * A visual is never an image the model draws: the model picks one of a few simple drawing types
 * and gives its numbers or words, and the app draws it. That keeps every picture accurate,
 * small, quick to generate and readable on a phone. The model may also decide that a picture
 * would not help; that decision is stored too (`required: false`).
 */

export const VISUAL_TYPES = ["number_line", "fraction_model", "area_model", "balance_scale", "venn_diagram", "set_roster", "geometry_shape", "bar_model"] as const satisfies readonly LessonVisualType[];

const label = (max: number) => z.string().trim().max(max);
const items = (count: number, length: number) => z.array(z.string().trim().min(1).max(length)).max(count);
const finite = z.number().finite();

const SPEC_SCHEMAS = {
    number_line: z.object({
        min: finite, max: finite, step: finite.positive(),
        points: z.array(z.object({ value: finite, label: label(20).optional() })).max(8).default([]),
        jumps: z.array(z.object({ from: finite, to: finite, label: label(20).optional() })).max(6).default([]),
    }),
    fraction_model: z.object({ shape: z.enum(["bar", "circle"]).default("bar"), numerator: z.number().int().min(0), denominator: z.number().int().min(1).max(12) }),
    area_model: z.object({ rows: z.number().int().min(1).max(10), cols: z.number().int().min(1).max(10), shaded: z.number().int().min(0), rowLabel: label(12).optional(), colLabel: label(12).optional() }),
    balance_scale: z.object({ left: items(6, 12).min(1), right: items(6, 12).min(1), balanced: z.boolean().default(true) }),
    venn_diagram: z.object({
        universal: z.object({ label: label(6).min(1), elements: items(16, 10) }).nullable().default(null),
        sets: z.array(z.object({ label: label(6).min(1), elements: items(12, 10) })).min(1).max(2),
    }),
    set_roster: z.object({ name: label(6).min(1), elements: items(12, 10) }),
    geometry_shape: z.object({
        shape: z.enum(["triangle", "right_triangle", "rectangle", "square", "circle", "parallelogram"]),
        sideLabels: items(4, 12).default([]),
        angleLabels: items(4, 10).default([]),
    }),
    bar_model: z.object({ bars: z.array(z.object({ label: label(12).min(1), value: finite.positive().max(1000) })).min(1).max(5), unit: label(12).default("") }),
} satisfies Record<LessonVisualType, z.ZodTypeAny>;

/** Checks a drawing for sense, not only shape: everything on a number line fits on it, and so on. */
function specProblems(spec: LessonVisualSpec): string[] {
    switch (spec.type) {
        case "number_line": {
            if (spec.min >= spec.max) return ["the number line's min must be smaller than its max"];
            const ticks = (spec.max - spec.min) / spec.step;
            if (ticks > 20 || Math.abs(ticks - Math.round(ticks)) > 1e-9) return ["the number line needs at most 20 equal steps from min to max"];
            const outside = [...spec.points.map((point) => point.value), ...spec.jumps.flatMap((jump) => [jump.from, jump.to])].find((value) => value < spec.min || value > spec.max);
            return outside === undefined ? [] : [`${outside} does not fit on a number line from ${spec.min} to ${spec.max}`];
        }
        case "fraction_model":
            return spec.numerator > spec.denominator ? ["the fraction model can only shade up to one whole; use a number line for fractions greater than 1"] : [];
        case "area_model":
            return spec.shaded > spec.rows * spec.cols ? ["the area model shades more cells than it has"] : [];
        case "venn_diagram": {
            if (!spec.universal) return [];
            const universe = new Set(spec.universal.elements);
            const missing = spec.sets.flatMap((set) => set.elements).filter((element) => !universe.has(element));
            return missing.length ? [`every element of the sets must also be in the universal set (missing ${[...new Set(missing)].join(", ")})`] : [];
        }
        default:
            return [];
    }
}

/** A drawing's data, checked; `error` says what to fix. */
export function parseVisualSpec(type: string, data: unknown): { spec: LessonVisualSpec } | { error: string } {
    if (!(VISUAL_TYPES as readonly string[]).includes(type)) return { error: `"${type}" is not one of the drawing types` };
    const parsed = SPEC_SCHEMAS[type as LessonVisualType].safeParse(data);
    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { error: `the ${type} data is not valid (${issue.path.join(".") || "data"}: ${issue.message})` };
    }
    const spec = { type, ...parsed.data } as LessonVisualSpec;
    const problems = specProblems(spec);
    return problems.length ? { error: problems[0] } : { spec };
}

/** Problems with a stored visual: none for "no picture", and none for a sound one. */
export function visualProblems(visual: LessonVisual | null | undefined): string[] {
    if (!visual || !visual.required) return [];
    if (!visual.spec) return ["the visual is switched on but has no drawing"];
    const { type, ...data } = visual.spec;
    const parsed = parseVisualSpec(type, data);
    return "error" in parsed ? [parsed.error] : [];
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const pair = (english: unknown, romanUrdu: unknown): LocalizedText => ({ english: text(english), romanUrdu: text(romanUrdu) });

/** The model's visual decision, turned into a stored visual. */
export function normalizeVisual(raw: unknown): { visual: LessonVisual | null; problems: string[] } {
    const data = (raw ?? {}) as { visual_required?: unknown; type?: unknown; caption_english?: unknown; caption_roman_urdu?: unknown; spec_json?: unknown };
    if (data.visual_required !== true) return { visual: { required: false, caption: { english: "", romanUrdu: "" }, spec: null }, problems: [] };
    const caption = pair(data.caption_english, data.caption_roman_urdu);
    let json: unknown;
    try {
        json = JSON.parse(text(data.spec_json) || "null");
    } catch {
        return { visual: null, problems: ["the visual's spec_json is not valid JSON"] };
    }
    const parsed = parseVisualSpec(text(data.type), json);
    if ("error" in parsed) return { visual: null, problems: [`the visual is not usable: ${parsed.error}`] };
    const problems = caption.english && caption.romanUrdu ? [] : ["the visual needs a one-line caption in English and Roman Urdu"];
    return { visual: problems.length ? null : { required: true, caption, spec: parsed.spec }, problems };
}

/** The model's worked example, checked for every part the lesson shows. */
export function normalizeWorkedExample(raw: unknown): { workedExample: WorkedExample | null; problems: string[] } {
    const data = (raw ?? {}) as { problem?: { english?: unknown; roman_urdu?: unknown }; steps?: unknown; final_answer?: { english?: unknown; roman_urdu?: unknown } };
    const steps = (Array.isArray(data.steps) ? data.steps : []).map((step: { english?: unknown; roman_urdu?: unknown; why_english?: unknown; why_roman_urdu?: unknown }) => ({
        text: pair(step?.english, step?.roman_urdu),
        why: pair(step?.why_english, step?.why_roman_urdu),
    }));
    const workedExample: WorkedExample = {
        problem: pair(data.problem?.english, data.problem?.roman_urdu),
        steps,
        finalAnswer: pair(data.final_answer?.english, data.final_answer?.roman_urdu),
    };
    const problems = workedExampleProblems(workedExample);
    return { workedExample: problems.length ? null : workedExample, problems };
}

/** What a worked example still lacks; empty when it is complete. */
export function workedExampleProblems(example: WorkedExample | null | undefined): string[] {
    if (!example) return ["the worked example is missing"];
    const problems: string[] = [];
    const full = (value: LocalizedText) => Boolean(value.english.trim() && value.romanUrdu.trim());
    if (!full(example.problem)) problems.push("the worked example needs its problem in English and Roman Urdu");
    if (example.steps.length < 2 || example.steps.length > 6) problems.push("the worked example needs 2 to 6 steps");
    if (example.steps.some((step) => !full(step.text) || !full(step.why))) problems.push("every worked example step needs what is done and why, in English and Roman Urdu");
    if (!full(example.finalAnswer)) problems.push("the worked example needs a final answer in English and Roman Urdu");
    return problems;
}

/** The regions of a Venn diagram, worked out from the sets, so the picture can never contradict them. */
export function vennRegions(spec: Extract<LessonVisualSpec, { type: "venn_diagram" }>) {
    const [first, second] = spec.sets;
    const inFirst = new Set(first.elements);
    const inSecond = new Set(second?.elements ?? []);
    const inAny = new Set([...inFirst, ...inSecond]);
    return {
        onlyFirst: first.elements.filter((element) => !inSecond.has(element)),
        both: first.elements.filter((element) => inSecond.has(element)),
        onlySecond: (second?.elements ?? []).filter((element) => !inFirst.has(element)),
        outside: (spec.universal?.elements ?? []).filter((element) => !inAny.has(element)),
    };
}

const bilingual = { type: "object", additionalProperties: false, required: ["english", "roman_urdu"], properties: { english: { type: "string" }, roman_urdu: { type: "string" } } };

/** What the model fills in for the worked example (OpenAI strict JSON). */
export const workedExampleSchema = {
    type: "object",
    additionalProperties: false,
    required: ["problem", "steps", "final_answer"],
    properties: {
        problem: bilingual,
        steps: {
            type: "array",
            items: {
                type: "object",
                additionalProperties: false,
                required: ["english", "roman_urdu", "why_english", "why_roman_urdu"],
                properties: { english: { type: "string" }, roman_urdu: { type: "string" }, why_english: { type: "string" }, why_roman_urdu: { type: "string" } },
            },
        },
        final_answer: bilingual,
    },
};

/** What the model fills in for the visual: a type and its data as a JSON string, or "none". */
export const visualSchema = {
    type: "object",
    additionalProperties: false,
    required: ["visual_required", "type", "caption_english", "caption_roman_urdu", "spec_json"],
    properties: {
        visual_required: { type: "boolean" },
        type: { type: "string", enum: [...VISUAL_TYPES, "none"] },
        caption_english: { type: "string" },
        caption_roman_urdu: { type: "string" },
        spec_json: { type: "string" },
    },
};

/** The drawing types as the model sees them: when to use each and the exact data to give. */
export const VISUAL_GUIDE = [
    'number_line: integers, ordering, adding or subtracting on a line, decimals. {"min":-5,"max":5,"step":1,"points":[{"value":-3,"label":"-3"}],"jumps":[{"from":-3,"to":2,"label":"+5"}]}',
    'fraction_model: a part of one whole. {"shape":"bar","numerator":3,"denominator":4} (shape bar or circle; denominator at most 12)',
    'area_model: multiplication, area, a fraction or percent of a grid. {"rows":3,"cols":4,"shaded":6,"rowLabel":"3","colLabel":"4"}',
    'balance_scale: equations and equal sides. {"left":["x","x","3"],"right":["7"],"balanced":true}',
    'venn_diagram: sets, union, intersection, difference, complement. {"universal":{"label":"U","elements":["1","2","3","4","5","6"]},"sets":[{"label":"A","elements":["1","2","3"]},{"label":"B","elements":["2","4","6"]}]} (one or two sets; universal may be null; every set element must be in the universal set)',
    'set_roster: naming a set and its elements, the empty set. {"name":"A","elements":["a","e","i","o","u"]} (elements may be [])',
    'geometry_shape: shapes, sides, perimeter, angles. {"shape":"rectangle","sideLabels":["8 cm","5 cm"],"angleLabels":[]} (shape: triangle, right_triangle, rectangle, square, circle, parallelogram)',
    'bar_model: ratio and comparing amounts. {"bars":[{"label":"Ali","value":3},{"label":"Sara","value":5}],"unit":"mangoes"} (one to five bars)',
].map((line) => `  - ${line}`).join("\n");

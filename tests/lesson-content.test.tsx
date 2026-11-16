import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LessonVisualView, WorkedExampleCard } from "@/components/lesson-visual";
import { conceptPrompt } from "@/lib/ai-studio/prompts";
import { newConceptFromDraft } from "@/lib/ai-studio/publish";
import { conceptSchemaFor, normalizeConcept } from "@/lib/ai-studio/schema";
import { blockingIssues, validateDraft } from "@/lib/ai-studio/validate";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { normalizeVisual, normalizeWorkedExample, parseVisualSpec, vennRegions, visualProblems } from "@/lib/lesson-visual";
import { firstIssue, managedTeacherSchema } from "@/lib/schools";
import type { LessonVisual, WorkedExample } from "@/types/curriculum";
import { reviewDraft as draft } from "./fixtures/ai-draft";

const t = (english: string) => ({ english, romanUrdu: english });
const worked: WorkedExample = {
    problem: t("Write the set of even numbers less than 7."),
    steps: [{ text: t("Even numbers less than 7 are 2, 4 and 6."), why: t("Even numbers divide by 2.") }, { text: t("Write them in curly brackets."), why: t("Curly brackets show a set.") }],
    finalAnswer: t("E = {2, 4, 6}"),
};
const rawWorked = {
    problem: { english: worked.problem.english, roman_urdu: worked.problem.romanUrdu },
    steps: worked.steps.map((step) => ({ english: step.text.english, roman_urdu: step.text.romanUrdu, why_english: step.why.english, why_roman_urdu: step.why.romanUrdu })),
    final_answer: { english: worked.finalAnswer.english, roman_urdu: worked.finalAnswer.romanUrdu },
};

describe("lesson visuals: simple drawings the app draws from a few numbers or words", () => {
    it("accepts every drawing type with sensible data", () => {
        const good: Array<[string, unknown]> = [
            ["number_line", { min: -5, max: 5, step: 1, points: [{ value: -3, label: "-3" }], jumps: [{ from: -3, to: 2, label: "+5" }] }],
            ["fraction_model", { shape: "circle", numerator: 3, denominator: 4 }],
            ["area_model", { rows: 3, cols: 4, shaded: 6 }],
            ["balance_scale", { left: ["x", "3"], right: ["7"], balanced: true }],
            ["venn_diagram", { universal: { label: "U", elements: ["1", "2", "3", "4"] }, sets: [{ label: "A", elements: ["1", "2"] }, { label: "B", elements: ["2", "3"] }] }],
            ["set_roster", { name: "A", elements: [] }],
            ["geometry_shape", { shape: "rectangle", sideLabels: ["8 cm", "5 cm"] }],
            ["bar_model", { bars: [{ label: "Ali", value: 3 }, { label: "Sara", value: 5 }], unit: "mangoes" }],
        ];
        for (const [type, data] of good) expect(parseVisualSpec(type, data), type).toHaveProperty("spec");
    });

    it("refuses a drawing that would be wrong or unreadable", () => {
        const errorOf = (type: string, data: unknown) => {
            const parsed = parseVisualSpec(type, data);
            return "error" in parsed ? parsed.error : "";
        };
        expect(errorOf("number_line", { min: 0, max: 5, step: 1, points: [{ value: 8 }] })).toContain("does not fit");
        expect(errorOf("number_line", { min: 0, max: 100, step: 1 })).toContain("at most 20");
        expect(errorOf("fraction_model", { numerator: 5, denominator: 4 })).toContain("one whole");
        expect(errorOf("area_model", { rows: 2, cols: 2, shaded: 5 })).toContain("more cells");
        expect(errorOf("venn_diagram", { universal: { label: "U", elements: ["1"] }, sets: [{ label: "A", elements: ["1", "9"] }] })).toContain("universal set");
        expect(errorOf("pie_chart", {})).toContain("not one of the drawing types");
    });

    it("reads the model's decision: no picture, a broken one, or a usable one", () => {
        expect(normalizeVisual({ visual_required: false, type: "none", caption_english: "", caption_roman_urdu: "", spec_json: "" })).toEqual({ visual: { required: false, caption: t(""), spec: null }, problems: [] });
        expect(normalizeVisual({ visual_required: true, type: "set_roster", caption_english: "A", caption_roman_urdu: "A", spec_json: "{oops" }).problems[0]).toContain("not valid JSON");
        expect(normalizeVisual({ visual_required: true, type: "set_roster", caption_english: "", caption_roman_urdu: "", spec_json: '{"name":"A","elements":["1"]}' }).problems[0]).toContain("caption");
        const usable = normalizeVisual({ visual_required: true, type: "set_roster", caption_english: "Set A", caption_roman_urdu: "Set A", spec_json: '{"name":"A","elements":["1","2"]}' });
        expect(usable.visual?.spec).toEqual({ type: "set_roster", name: "A", elements: ["1", "2"] });
    });

    it("works out the Venn regions from the sets, so the picture cannot contradict them", () => {
        const parsed = parseVisualSpec("venn_diagram", { universal: { label: "U", elements: ["1", "2", "3", "4", "5"] }, sets: [{ label: "A", elements: ["1", "2", "3"] }, { label: "B", elements: ["3", "4"] }] });
        if (!("spec" in parsed) || parsed.spec.type !== "venn_diagram") throw new Error("expected a Venn diagram");
        expect(vennRegions(parsed.spec)).toEqual({ onlyFirst: ["1", "2"], both: ["3"], onlySecond: ["4"], outside: ["5"] });
    });

    it("draws the picture and the worked example for the student", () => {
        const visual: LessonVisual = { required: true, caption: t("A and B share 3"), spec: { type: "venn_diagram", universal: null, sets: [{ label: "A", elements: ["1", "3"] }, { label: "B", elements: ["3", "5"] }] } };
        const picture = renderToStaticMarkup(<LessonVisualView visual={visual} language="english" />);
        expect(picture).toContain("<svg");
        expect(picture).toContain("A and B share 3");
        expect(renderToStaticMarkup(<LessonVisualView visual={{ required: false, caption: t(""), spec: null }} language="english" />)).toBe("");
        const card = renderToStaticMarkup(<WorkedExampleCard example={worked} language="roman-urdu" />);
        expect(card).toContain("Kyun:");
        expect(card).toContain("E = {2, 4, 6}");
    });
});

describe("worked examples", () => {
    it("needs a problem, 2 to 6 steps with what and why, and a final answer", () => {
        expect(normalizeWorkedExample(rawWorked)).toEqual({ workedExample: worked, problems: [] });
        expect(normalizeWorkedExample({ ...rawWorked, steps: rawWorked.steps.slice(0, 1) }).problems).toContain("the worked example needs 2 to 6 steps");
        expect(normalizeWorkedExample({ ...rawWorked, steps: [{ ...rawWorked.steps[0], why_english: "" }, rawWorked.steps[1]] }).problems[0]).toContain("what is done and why");
        expect(normalizeWorkedExample({ ...rawWorked, final_answer: { english: "", roman_urdu: "" } }).problems).toContain("the worked example needs a final answer in English and Roman Urdu");
    });
});

describe("AI Studio writes the worked example and the visual with every micro-topic lesson", () => {
    const micro = draft({ easy: 0, medium: 0, hard: 0 }).target;

    it("asks for them only in a micro-topic lesson", () => {
        const ask = conceptPrompt({ level: "micro", target: micro }).user;
        expect(ask).toContain("- worked_example:");
        expect(ask).toContain("visual_required");
        expect(ask).toContain("venn_diagram");
        expect((conceptSchemaFor("micro") as { required: string[] }).required).toEqual(expect.arrayContaining(["worked_example", "visual"]));
        expect(conceptPrompt({ level: "main", target: { ...micro, microTopic: null } }).user).not.toContain("worked_example");
    });

    it("keeps them on the lesson it reads and on a new micro-topic it publishes", () => {
        const read = normalizeConcept({
            title: "Sets", english: "A set is a collection.", roman_urdu: "Set ek collection hai.", real_life_example: { english: "x", roman_urdu: "y" },
            covers: ["a", "b"], excludes: ["c", "d"], worked_example: rawWorked,
            visual: { visual_required: true, type: "set_roster", caption_english: "Set E", caption_roman_urdu: "Set E", spec_json: '{"name":"E","elements":["2","4","6"]}' },
        });
        expect(read.problems).toEqual([]);
        expect(read.concept?.workedExample).toEqual(worked);
        expect(read.concept?.visual?.required).toBe(true);
        const lesson = newConceptFromDraft(draft({ easy: 0, medium: 0, hard: 0 }, {
            concept: read.concept!,
            target: { classLevel: 6, chapter: { topicId: "class6-integers", title: "Integers" }, subTopic: null, microTopic: { microTag: null, title: "Absolute Value" }, microTopics: [] },
        }), MICRO_CONCEPTS);
        expect(lesson.workedExample).toEqual(worked);
        expect(lesson.visual?.spec?.type).toBe("set_roster");
    });

    it("lets an older draft through with a warning but blocks an incomplete worked example or a broken visual", () => {
        const old = draft({ easy: 10, medium: 10, hard: 10 });
        expect(blockingIssues(validateDraft(old))).toEqual([]);
        expect(validateDraft(old).some((issue) => issue.severity === "warning" && issue.message.includes("before worked examples"))).toBe(true);
        const incomplete = draft({ easy: 10, medium: 10, hard: 10 }, { concept: { ...old.concept!, workedExample: { ...worked, steps: worked.steps.slice(0, 1) } } });
        expect(blockingIssues(validateDraft(incomplete)).map((issue) => issue.message)).toContain("The worked example needs 2 to 6 steps.");
        const broken = draft({ easy: 10, medium: 10, hard: 10 }, { concept: { ...old.concept!, workedExample: worked, visual: { required: true, caption: t("x"), spec: { type: "area_model", rows: 2, cols: 2, shaded: 9 } } } });
        expect(blockingIssues(validateDraft(broken)).map((issue) => issue.message)).toContain("The area model shades more cells than it has.");
        expect(visualProblems({ required: false, caption: t(""), spec: null })).toEqual([]);
    });
});

describe("teachers: a mobile number or an email", () => {
    it("lets a school add a teacher with either, and refuses neither", () => {
        expect(managedTeacherSchema.parse({ name: "Ms Khan", email: "khan@example.com" })).toMatchObject({ phone: null, email: "khan@example.com" });
        expect(managedTeacherSchema.parse({ name: "Ms Khan", phone: "03001234567" })).toMatchObject({ phone: "+923001234567", email: null });
        expect(firstIssue(managedTeacherSchema.safeParse({ name: "Ms Khan" }).error)).toBe("Enter a mobile number or an email address");
    });
});

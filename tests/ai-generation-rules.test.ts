import { describe, expect, it } from "vitest";
import { batchFocus, checkerTopic, conceptPrompt, questionPrompt, scopeRules, verificationPrompt } from "@/lib/ai-studio/prompts";
import { normalizeQuestionBatch, questionBatchSchema } from "@/lib/ai-studio/schema";
import { findNearCopy, isNearCopy, questionSignature } from "@/lib/ai-studio/similarity";
import { buildTarget, targetKey } from "@/lib/ai-studio/target";
import { NEW_MICRO_TAG, type GenerationDraft } from "@/lib/ai-studio/types";
import { blockingIssues, brevityIssues, validateDraft } from "@/lib/ai-studio/validate";
import { MICRO_CONCEPTS } from "@/lib/curriculum";
import { draftQuestion, reviewDraft } from "./fixtures/ai-draft";

const chapter = { topicId: "class6-integers", title: "" };
const targetFor = (input: Parameters<typeof buildTarget>[0]) => {
    const built = buildTarget(input, MICRO_CONCEPTS);
    if (!("target" in built)) throw new Error(built.error);
    return built.target;
};
const micro = targetFor({ level: "micro", classLevel: 6, chapter, microTopic: { microTag: "c6-negative-numbers", title: "" } });
const sub = targetFor({ level: "sub", classLevel: 6, chapter, subTopic: "Signed numbers", microTags: ["c6-positive-numbers", "c6-negative-numbers"] });
const main = targetFor({ level: "main", classLevel: 6, chapter });

describe("1. strict topic scope", () => {
    it("keeps a micro-topic pool on that micro-topic, naming what it covers", () => {
        const rules = scopeRules({ level: "micro", target: micro });
        expect(rules).toContain('STRICT SCOPE: this micro-topic only');
        expect(rules).toContain('Every question must test "Negative Numbers" and nothing else: Negative numbers are less than zero');
        expect(rules).toContain('Do not ask about other ideas from the main topic "Integers"');
        const prompt = questionPrompt({ level: "micro", target: micro, concept: null }, { difficulty: "hard", count: 3, avoid: [] });
        expect(prompt.user).toContain(rules);
        expect(prompt.user).toContain("Set micro_tag to c6-negative-numbers for every question.");
        expect(conceptPrompt({ level: "micro", target: micro }).user).toContain('Explain only the micro-topic "Negative Numbers"');
        expect(conceptPrompt({ level: "sub", target: sub }).user).toContain('Explain only the sub-topic "Signed numbers", made of: Positive Numbers, Negative Numbers.');
        expect(conceptPrompt({ level: "main", target: main }).user).toContain('Explain the core ideas of the main topic "Integers".');
    });

    it("keeps a sub-topic pool inside its micro-topics, and a main-topic pool on the chapter's core ideas", () => {
        const subRules = scopeRules({ level: "sub", target: sub });
        expect(subRules).toContain('STRICT SCOPE: the sub-topic "Signed numbers" only');
        expect(subRules).toContain("- c6-positive-numbers: Positive Numbers (Positive numbers are greater than zero");
        expect(subRules).not.toContain("c6-integer-addition");
        const mainRules = scopeRules({ level: "main", target: main });
        expect(mainRules).toContain('Cover the core concepts of this main topic');
        expect(mainRules.match(/^- c6-/gm)).toHaveLength(7);
    });

    it("describes a brand-new micro-topic by its freshly written explanation", () => {
        const target = targetFor({ level: "micro", classLevel: 8, chapter: { topicId: null, title: "Operations on Sets" }, microTopic: { microTag: null, title: "Meaning of a set" } });
        const concept = { title: "Sets", example: { english: "e", romanUrdu: "r" }, explanation: { english: "A set is a well-defined collection of objects.", romanUrdu: "r" } };
        expect(target.microTopics[0].microTag).toBe(NEW_MICRO_TAG);
        expect(scopeRules({ level: "micro", target }, concept)).toContain('test "Meaning of a set" and nothing else: A set is a well-defined collection of objects.');
    });

    it("spreads sub-topic and main-topic batches over the least-covered micro-topics", () => {
        const draft = { level: "main" as const, target: main, questions: [] as GenerationDraft["questions"] };
        expect(batchFocus(draft, 3)).toEqual(["c6-integers-intro", "c6-positive-numbers", "c6-negative-numbers"]);
        draft.questions = ["c6-integers-intro", "c6-positive-numbers", "c6-negative-numbers"].map((microTag) => draftQuestion({ microTag }));
        expect(batchFocus(draft, 3)).toEqual(["c6-number-line", "c6-integer-comparisons", "c6-integer-addition"]);
        expect(batchFocus({ level: "micro", target: micro, questions: [] }, 3)).toEqual([]);
        const prompt = questionPrompt({ level: "main", target: main, concept: null }, { difficulty: "easy", count: 2, avoid: [], focus: ["c6-number-line", "c6-integer-addition"] });
        expect(prompt.user).toContain("write one question for each of these micro-topics, in this order, and set micro_tag to match: c6-number-line, c6-integer-addition.");
    });

    it("lists the chapter's other micro-topics as out of scope", () => {
        expect(micro.outside?.map((topic) => topic.title)).toEqual(["Introduction to Integers", "Positive Numbers", "Number Line Mechanics", "Integer Comparisons", "Basic Integer Addition", "Basic Integer Subtraction"]);
        expect(sub.outside).toHaveLength(5);
        expect(main.outside).toBeUndefined();
        const rules = scopeRules({ level: "micro", target: micro });
        expect(rules).toContain("OUT OF SCOPE: never ask about these, not even as one step of a question.");
        expect(rules).toContain("- Positive Numbers (another lesson of this chapter)");
    });

    it("writes the boundary first, then holds every question to it", () => {
        const conceptAsk = conceptPrompt({ level: "micro", target: micro }).user;
        expect(conceptAsk).toContain("- covers: 3 to 6 specific skills");
        expect(conceptAsk).toContain("- excludes: 3 to 6 neighbouring ideas");
        expect(conceptAsk).toContain("The chapter's other lessons, which belong to their own pools: Introduction to Integers; Positive Numbers");

        const concept = {
            title: "Sets", example: { english: "e", romanUrdu: "r" }, explanation: { english: "A set is a well-defined collection.", romanUrdu: "r" },
            scope: { covers: ["meaning of a set", "decide if a collection is well-defined"], excludes: ["infinite sets", "set notation"] },
        };
        const target = targetFor({ level: "micro", classLevel: 8, chapter: { topicId: null, title: "Sets" }, microTopic: { microTag: null, title: "Definition of sets" } });
        const rules = scopeRules({ level: "micro", target }, concept);
        expect(rules).toContain("IN SCOPE: only these skills.\n- meaning of a set\n- decide if a collection is well-defined");
        expect(rules).toContain("OUT OF SCOPE: never ask about these, not even as one step of a question.\n- infinite sets\n- set notation");
        expect(questionPrompt({ level: "micro", target, concept }, { difficulty: "easy", count: 3, avoid: [] }).user)
            .toContain("Set skill to the IN SCOPE skill each question tests");

        // The model cannot name a skill outside the list, and the reply is checked again in code.
        const schema = questionBatchSchema([NEW_MICRO_TAG], concept.scope.covers) as any;
        expect(schema.properties.questions.items.properties.skill).toEqual({ type: "string", enum: concept.scope.covers });
        expect(schema.properties.questions.items.required).toContain("skill");
        const reply = { questions: [{ skill: "infinite sets", micro_tag: NEW_MICRO_TAG, question_text: "Is it a set?", options: ["Yes", "No", "Maybe", "Never"], correct_option: "A",
            hint: { english: "h", roman_urdu: "h" }, step_by_step_explanation: { english: "s", roman_urdu: "s" },
            wrong_option_analysis: ["B", "C", "D"].map((option) => ({ option, english: "w", roman_urdu: "w", misconception_tag: "arithmetic-slip" })) }] };
        expect(normalizeQuestionBatch(reply, { difficulty: "easy", count: 1, allowedTags: [NEW_MICRO_TAG], skills: concept.scope.covers }).problems)
            .toEqual(["question 1 must test one of the covered skills"]);
        const fixed = normalizeQuestionBatch({ questions: [{ ...reply.questions[0], skill: "meaning of a set" }] }, { difficulty: "easy", count: 1, allowedTags: [NEW_MICRO_TAG], skills: concept.scope.covers });
        expect(fixed.questions[0].skill).toBe("meaning of a set");
    });

    it("gives the checker the same boundary", () => {
        const draft = reviewDraft({ easy: 0, medium: 0, hard: 0 });
        draft.concept = { ...draft.concept!, scope: { covers: ["read integers"], excludes: ["integer addition"] } };
        draft.target.outside = [{ title: "Positive Numbers" }];
        expect(checkerTopic(draft, "c6-integers-intro"))
            .toBe("Introduction to Integers. Covers only: read integers. Does NOT cover: Positive Numbers (another lesson of this chapter); integer addition");
        expect(verificationPrompt([{ key: "q1", questionText: "?", options: ["1", "2", "3", "4"], topic: "t" }], "micro").user)
            .toContain('Mark on_topic false if it tests or needs anything listed under "Does NOT cover"');
    });

    it("asks the checker whether each question stays on its topic", () => {
        const prompt = verificationPrompt([{ key: "q1", questionText: "What is 2 + 2?", options: ["4", "3", "5", "6"], topic: "Negative Numbers" }], "micro");
        expect(prompt.user).toContain("topic: Negative Numbers");
        expect(prompt.user).toContain("Each question must test only its topic");
    });

    it("blocks an off-topic question until a person keeps it", () => {
        const draft = reviewDraft({ easy: 10, medium: 10, hard: 10 });
        draft.questions[0] = draftQuestion({ verification: { status: "agrees", aiAnswer: "A", onTopic: false, topicNote: "About fractions." } });
        expect(blockingIssues(validateDraft(draft)).map((issue) => issue.message))
            .toContain("The checker says this question goes outside its micro-topic: About fractions. Rewrite or remove it, or keep it if it is on topic.");
        draft.questions[0] = draftQuestion({ verification: { status: "confirmed", onTopic: false } });
        expect(blockingIssues(validateDraft(draft))).toEqual([]);
    });
});

describe("2. no repetition", () => {
    it("catches the same question with only the numbers changed", () => {
        const first = questionSignature("Ali buys 3 pencils at Rs. 12 each at the tuck shop. How much does he pay in total?");
        expect(isNearCopy(first, questionSignature("Ali buys 5 pencils at Rs. 20 each at the tuck shop. How much does he pay in total?"))).toBe(true);
        expect(isNearCopy(first, questionSignature("Sara has 3 mangoes and shares 12 of them with friends at school. How many does she keep?"))).toBe(false);
    });

    it("catches the same numbers in reworded text, but not different short sums", () => {
        const first = questionSignature("A diver is 12 metres below sea level and rises 7 metres. Where is he now?");
        expect(isNearCopy(first, questionSignature("A diver at 12 metres below sea level goes up 7 metres. Where is the diver?"))).toBe(true);
        expect(isNearCopy(questionSignature("What is -7 + 3?"), questionSignature("What is -9 + 4?"))).toBe(false);
        expect(isNearCopy(questionSignature("What is -7 + 3?"), questionSignature("What is 3 + -7?"))).toBe(true);
        expect(findNearCopy("What is 3 + -7?", [questionSignature("What is 10 - 2?"), questionSignature("What is -7 + 3?")])).toBe(1);
    });

    it("blocks near copies inside a pool and warns about near copies of live questions", () => {
        const draft = reviewDraft({ easy: 10, medium: 10, hard: 10 });
        draft.questions[0] = draftQuestion({ questionText: "Ali buys 3 pencils at Rs. 12 each at the tuck shop. How much does he pay?" });
        draft.questions[1] = draftQuestion({ questionText: "Ali buys 4 pencils at Rs. 15 each at the tuck shop. How much does he pay?" });
        const live = new Set(["bilal walks 3 km to school and 2 km back home. how far does bilal walk in all?"]);
        draft.questions[2] = draftQuestion({ questionText: "Bilal walks 3 km to school and 2 km back home. How far does Bilal walk altogether?" });
        const issues = validateDraft(draft, live);
        const copy = blockingIssues(issues).find((issue) => issue.where === draft.questions[1].key);
        expect(copy?.message).toMatch(/^Almost the same as another question in the pool \("ali buys 3 pencils at rs\. 12 each/);
        expect(copy?.message).toContain("Change the idea or situation, not just the numbers.");
        expect(issues.find((issue) => issue.where === draft.questions[2].key && issue.message === "Very similar to a question already in the live bank.")?.severity).toBe("warning");
    });

    it("sends every existing question to the model with the no-repeats rule", () => {
        const avoid = Array.from({ length: 200 }, (_, index) => `Existing question number ${index}`);
        const prompt = questionPrompt({ level: "micro", target: micro, concept: null }, { difficulty: "easy", count: 3, avoid });
        expect(prompt.user).toContain("NO REPEATS (strict)");
        expect(prompt.user).toContain("Changing only names or numbers is not enough.");
        expect(prompt.user).toContain("- Existing question number 199");
        expect(prompt.user).toContain("- Existing question number 50");
        expect(prompt.user).not.toContain("- Existing question number 49\n");
    });
});

describe("3. short, quick questions", () => {
    it("rejects long questions and long options, and warns about big or fiddly numbers", () => {
        const long = { questionText: Array.from({ length: 41 }, () => "word").join(" "), options: ["1", "2", "3", "4"] };
        expect(brevityIssues(long)[0]).toEqual({ severity: "error", message: "Too long (41 words). Keep the question under 40 words so it checks the idea, not reading." });
        expect(brevityIssues({ questionText: "Pick one.", options: ["a b c d e f g h i j k l m", "2", "3", "4"] })[0].severity).toBe("error");
        expect(brevityIssues({ questionText: "What is 12,500 + 3?", options: ["12,503", "2", "3", "4"] })).toEqual([
            { severity: "warning", message: "Uses a large number (12,500). Small, clean numbers keep the focus on the idea." },
        ]);
        expect(brevityIssues({ questionText: "Round 3.14159.", options: ["3", "2", "1", "4"] })[0].severity).toBe("warning");
        expect(brevityIssues({ questionText: "What is -7 + 3?", options: ["-4", "4", "-10", "10"] })).toEqual([]);
    });

    it("tells the model to keep questions short with clean numbers, and hard means thinking, not length", () => {
        const prompt = questionPrompt({ level: "micro", target: micro, concept: null }, { difficulty: "hard", count: 3, avoid: [] });
        expect(prompt.system).toContain("question_text is one or two short sentences, at most 30 words");
        expect(prompt.system).toContain("Use small, clean numbers");
        expect(prompt.user).toContain("Make it hard through thinking, never through length, extra conditions or big numbers.");
    });
});

describe("4. only the new content", () => {
    it("gives the same request the same key, so a new run replaces an unfinished one", () => {
        expect(targetKey("micro", micro)).toBe("micro:6:c6-negative-numbers");
        expect(targetKey("sub", sub)).toBe("sub:6:c6-negative-numbers,c6-positive-numbers");
        const fresh = targetFor({ level: "micro", classLevel: 8, chapter: { topicId: null, title: "Operations on Sets" }, microTopic: { microTag: null, title: "Meaning of a Set" } });
        expect(targetKey("micro", fresh)).toBe(`micro:8:${NEW_MICRO_TAG}:new:operations on sets/meaning of a set`);
        expect(targetKey("main", main)).not.toBe(targetKey("micro", micro));
    });
});
